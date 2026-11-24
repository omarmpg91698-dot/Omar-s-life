package com.omarai.assistant.tools

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import com.omarai.assistant.data.local.MemoryDao
import com.omarai.assistant.data.local.MemoryEntity
import com.omarai.assistant.data.local.NoteDao
import com.omarai.assistant.data.local.NoteEntity
import com.omarai.assistant.data.local.ReminderDao
import com.omarai.assistant.data.local.ReminderEntity
import com.omarai.assistant.data.local.TaskDao
import com.omarai.assistant.data.local.TaskEntity
import com.omarai.assistant.data.remote.ToolCallDto
import java.net.URLEncoder
import java.time.Instant
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

data class ToolExecutionResult(
    val toolType: String,
    val succeeded: Boolean,
    val message: String
)

/**
 * Executes ONLY real, officially permitted Android capabilities.
 * Never pretends an action succeeded if the system cannot resolve it.
 */
class AndroidPhoneTools(
    private val context: Context,
    private val memoryDao: MemoryDao,
    private val taskDao: TaskDao,
    private val reminderDao: ReminderDao,
    private val noteDao: NoteDao,
    private val reminderAlarmScheduler: ReminderAlarmScheduler
) {

    suspend fun execute(tool: ToolCallDto): ToolExecutionResult {
        return when (tool.type) {
            "open_app" -> openInstalledApp(tool.appName.orEmpty())
            "dial_number" -> openDialer(tool.phoneNumber.orEmpty())
            "open_website" -> openWebsite(tool.url.orEmpty())
            "create_calendar_event" -> openCalendarInsert(
                title = tool.title.orEmpty(),
                description = tool.description.orEmpty(),
                startTimeIso = tool.startTimeIso
            )
            "create_reminder" -> scheduleReminder(
                title = tool.title.orEmpty(),
                reminderTime = tool.reminderTime,
                recurrence = tool.recurrence,
                daysOfWeek = tool.daysOfWeek,
                delayMinutes = tool.delayMinutes
            )
            "create_task" -> createLocalTask(
                title = tool.title.orEmpty(),
                dueDateIso = tool.dueDateIso
            )
            "complete_task" -> completeLocalTask(tool.taskId.orEmpty(), tool.title.orEmpty())
            "share_content" -> shareText(tool.shareText ?: tool.title.orEmpty())
            "save_memory" -> saveMemory(
                category = tool.memoryCategory ?: "شخصي",
                fact = tool.memoryFact.orEmpty(),
                isSensitive = tool.isSensitiveMemory
            )
            "compose_email" -> composeEmail(
                to = tool.recipientEmail.orEmpty(),
                subject = tool.subject.orEmpty(),
                body = tool.body.orEmpty()
            )
            "create_note" -> createPhoneNote(
                title = tool.title.orEmpty(),
                content = tool.content ?: tool.description.orEmpty(),
                category = tool.noteCategory ?: "شخصي",
                openInPhoneNotes = tool.openInPhoneNotes
            )
            "send_message" -> sendMessage(
                channel = tool.channel ?: "whatsapp",
                recipientName = tool.recipientName.orEmpty(),
                rawPhoneNumber = tool.phoneNumber.orEmpty(),
                messageText = tool.messageText ?: tool.body.orEmpty()
            )
            else -> ToolExecutionResult(
                toolType = tool.type,
                succeeded = false,
                message = "الأمر ده غير مدعوم حالياً على أندرويد."
            )
        }
    }

    suspend fun schedulePreciseReminder(
        title: String,
        hour: Int,
        minute: Int,
        recurrence: String,
        daysOfWeek: List<Int> = emptyList()
    ): ToolExecutionResult {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) {
            return ToolExecutionResult("create_reminder", false, "محتاج عنوان واضح للتذكير.")
        }

        val safeHour = hour.coerceIn(0, 23)
        val safeMinute = minute.coerceIn(0, 59)
        val normalizedRecurrence = ReminderScheduleCalculator.normalizeRecurrence(recurrence)
        val cleanDays = daysOfWeek.filter { it in 1..7 }.distinct().sorted()

        val nextTriggerMillis = ReminderScheduleCalculator.computeNextTriggerMillis(
            hour = safeHour,
            minute = safeMinute,
            recurrence = normalizedRecurrence,
            daysOfWeek = cleanDays
        )

        val entity = ReminderEntity(
            title = cleanTitle,
            hour = safeHour,
            minute = safeMinute,
            recurrence = normalizedRecurrence,
            daysOfWeekCsv = ReminderScheduleCalculator.daysToCsv(cleanDays),
            nextTriggerMillis = nextTriggerMillis,
            isEnabled = true
        )

        reminderDao.upsert(entity)
        reminderAlarmScheduler.schedule(entity)

        taskDao.upsert(
            TaskEntity(
                title = cleanTitle,
                reminderTimeMillis = nextTriggerMillis,
                recurrence = normalizedRecurrence
            )
        )

        val timeLabel = ReminderScheduleCalculator.formatTimeArabic12(safeHour, safeMinute)
        val recurrenceLabel = ReminderScheduleCalculator.formatRecurrenceLabelArabic(
            normalizedRecurrence,
            cleanDays
        )

        return ToolExecutionResult(
            toolType = "create_reminder",
            succeeded = true,
            message = "تم جدولة التذكير \"$cleanTitle\" ($recurrenceLabel · الساعة $timeLabel) بنظام تنبيهات أندرويد."
        )
    }

    private suspend fun scheduleReminder(
        title: String,
        reminderTime: String?,
        recurrence: String?,
        daysOfWeek: List<Int>?,
        delayMinutes: Int?
    ): ToolExecutionResult {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) {
            return ToolExecutionResult("create_reminder", false, "محتاج عنوان واضح للتذكير.")
        }

        val parsedTime = ReminderScheduleCalculator.parseTime24(reminderTime)
        if (parsedTime != null) {
            return schedulePreciseReminder(
                title = cleanTitle,
                hour = parsedTime.first,
                minute = parsedTime.second,
                recurrence = recurrence ?: ReminderScheduleCalculator.RECURRENCE_ONCE,
                daysOfWeek = daysOfWeek.orEmpty()
            )
        }

        // Fallback to relative delay (e.g., "after 30 minutes")
        val safeDelay = (delayMinutes ?: 15).coerceIn(1, 60 * 24 * 30)
        val targetDateTime = ZonedDateTime.now().plusMinutes(safeDelay.toLong())
        val normalizedRecurrence = ReminderScheduleCalculator.normalizeRecurrence(recurrence)

        val entity = ReminderEntity(
            title = cleanTitle,
            hour = targetDateTime.hour,
            minute = targetDateTime.minute,
            recurrence = normalizedRecurrence,
            daysOfWeekCsv = ReminderScheduleCalculator.daysToCsv(daysOfWeek),
            nextTriggerMillis = targetDateTime.toInstant().toEpochMilli(),
            isEnabled = true
        )

        reminderDao.upsert(entity)
        reminderAlarmScheduler.schedule(entity)

        taskDao.upsert(
            TaskEntity(
                title = cleanTitle,
                reminderTimeMillis = entity.nextTriggerMillis,
                recurrence = normalizedRecurrence
            )
        )

        val timeLabel = ReminderScheduleCalculator.formatTimeArabic12(entity.hour, entity.minute)
        val recurrenceLabel = ReminderScheduleCalculator.formatRecurrenceLabelArabic(
            normalizedRecurrence,
            daysOfWeek.orEmpty()
        )
        return ToolExecutionResult(
            toolType = "create_reminder",
            succeeded = true,
            message = "ظبطتلك تذكير \"$cleanTitle\" ($recurrenceLabel · الساعة $timeLabel)."
        )
    }

    private fun openInstalledApp(queryName: String): ToolExecutionResult {
        val clean = queryName.trim()
        if (clean.isEmpty()) {
            return ToolExecutionResult("open_app", false, "مفيش اسم تطبيق واضح عشان أفتحه.")
        }

        val pm = context.packageManager
        val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val apps = pm.queryIntentActivities(mainIntent, PackageManager.MATCH_ALL)
        val lowered = clean.lowercase()

        val match = apps.firstOrNull { info ->
            val label = info.loadLabel(pm)?.toString()?.lowercase().orEmpty()
            val pkg = info.activityInfo.packageName.lowercase()
            label == lowered || label.contains(lowered) || pkg.contains(lowered)
        } ?: return ToolExecutionResult(
            toolType = "open_app",
            succeeded = false,
            message = "ملقتش تطبيق باسم \"$clean\" متثبت على الموبايل."
        )

        val launchIntent = pm.getLaunchIntentForPackage(match.activityInfo.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ?: return ToolExecutionResult(
                toolType = "open_app",
                succeeded = false,
                message = "مقدرتش أفتح التطبيق ده."
            )

        return runCatching {
            context.startActivity(launchIntent)
            val appLabel = match.loadLabel(pm).toString()
            ToolExecutionResult("open_app", true, "فتحتلك تطبيق $appLabel.")
        }.getOrElse {
            ToolExecutionResult("open_app", false, "حصلت مشكلة وأنا بفتح التطبيق.")
        }
    }

    private fun openDialer(rawPhone: String): ToolExecutionResult {
        val sanitized = rawPhone.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }
        if (sanitized.length < 3) {
            return ToolExecutionResult("dial_number", false, "رقم التليفون غير صالح.")
        }
        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$sanitized")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return runCatching {
            context.startActivity(intent)
            ToolExecutionResult("dial_number", true, "فتحتلك شاشة الاتصال بالرقم $sanitized.")
        }.getOrElse {
            ToolExecutionResult("dial_number", false, "مفيش تطبيق اتصال متاح على الجهاز.")
        }
    }

    private fun openWebsite(rawUrl: String): ToolExecutionResult {
        val trimmed = rawUrl.trim()
        val uri = runCatching { Uri.parse(trimmed) }.getOrNull()
        val scheme = uri?.scheme?.lowercase()
        if (uri == null || (scheme != "https" && scheme != "http")) {
            return ToolExecutionResult(
                "open_website",
                false,
                "الرابط غير صالح. بفتح روابط http أو https فقط."
            )
        }
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return runCatching {
            context.startActivity(intent)
            ToolExecutionResult("open_website", true, "فتحتلك الرابط: ${uri.host ?: trimmed}")
        }.getOrElse {
            ToolExecutionResult("open_website", false, "ملقتش متصفح يفتح الرابط ده.")
        }
    }

    private fun openCalendarInsert(
        title: String,
        description: String,
        startTimeIso: String?
    ): ToolExecutionResult {
        val cleanTitle = title.trim().ifEmpty { "موعد جديد" }
        val startMillis = startTimeIso
            ?.let { iso ->
                runCatching { Instant.parse(iso).toEpochMilli() }
                    .recoverCatching { ZonedDateTime.parse(iso).toInstant().toEpochMilli() }
                    .getOrNull()
            }
            ?: (System.currentTimeMillis() + TimeUnit.HOURS.toMillis(1))

        val intent = Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, cleanTitle)
            if (description.isNotBlank()) {
                putExtra(CalendarContract.Events.DESCRIPTION, description)
            }
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, startMillis + TimeUnit.HOURS.toMillis(1))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return runCatching {
            context.startActivity(intent)
            ToolExecutionResult("create_calendar_event", true, "فتحتلك التقويم لتأكيد موعد: $cleanTitle.")
        }.getOrElse {
            ToolExecutionResult("create_calendar_event", false, "مفيش تطبيق تقويم متاح على الموبايل.")
        }
    }

    private suspend fun createLocalTask(title: String, dueDateIso: String?): ToolExecutionResult {
        val clean = title.trim()
        if (clean.isEmpty()) {
            return ToolExecutionResult("create_task", false, "مفيش عنوان للمهمة.")
        }
        taskDao.upsert(
            TaskEntity(
                title = clean,
                dueDateIso = dueDateIso?.takeIf { it.isNotBlank() }
            )
        )
        return ToolExecutionResult("create_task", true, "أضفتلك مهمة: $clean")
    }

    private suspend fun completeLocalTask(taskId: String, title: String): ToolExecutionResult {
        if (taskId.isBlank()) {
            return ToolExecutionResult("complete_task", false, "مقدرتش أحدد المهمة المطلوب إنهائها.")
        }
        taskDao.setCompleted(taskId, true)
        val label = title.ifBlank { "المهمة" }
        return ToolExecutionResult("complete_task", true, "علّمت على \"$label\" إنها خلصت.")
    }

    private fun shareText(text: String): ToolExecutionResult {
        val clean = text.trim()
        if (clean.isEmpty()) {
            return ToolExecutionResult("share_content", false, "مفيش محتوى للمشاركة.")
        }
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, clean)
        }
        val chooser = Intent.createChooser(sendIntent, "مشاركة عبر").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return runCatching {
            context.startActivity(chooser)
            ToolExecutionResult("share_content", true, "فتحتلك قائمة المشاركة.")
        }.getOrElse {
            ToolExecutionResult("share_content", false, "مقدرتش أفتح قائمة المشاركة.")
        }
    }

    private suspend fun saveMemory(
        category: String,
        fact: String,
        isSensitive: Boolean
    ): ToolExecutionResult {
        val clean = fact.trim()
        if (clean.isEmpty()) {
            return ToolExecutionResult("save_memory", false, "مفيش معلومة واضحة للحفظ.")
        }
        memoryDao.upsert(
            MemoryEntity(
                category = category.ifBlank { "شخصي" },
                fact = clean,
                isSensitive = isSensitive
            )
        )
        return ToolExecutionResult("save_memory", true, "حفظت في ذاكرتي: $clean")
    }

    /**
     * Opens Gmail / default email client pre-filled with recipient, subject, and body template.
     * User reviews and taps Send for safety.
     */
    private fun composeEmail(to: String, subject: String, body: String): ToolExecutionResult {
        val cleanTo = to.trim()
        val cleanSubject = subject.trim()
        val cleanBody = body.trim()
        if (cleanSubject.isEmpty() && cleanBody.isEmpty()) {
            return ToolExecutionResult("compose_email", false, "مفيش محتوى واضح للإيميل.")
        }

        val mailtoBuilder = StringBuilder("mailto:")
        if (cleanTo.isNotEmpty()) {
            mailtoBuilder.append(Uri.encode(cleanTo))
        }
        val queryParts = mutableListOf<String>()
        if (cleanSubject.isNotEmpty()) {
            queryParts.add("subject=${Uri.encode(cleanSubject)}")
        }
        if (cleanBody.isNotEmpty()) {
            queryParts.add("body=${Uri.encode(cleanBody)}")
        }
        if (queryParts.isNotEmpty()) {
            mailtoBuilder.append("?").append(queryParts.joinToString("&"))
        }

        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse(mailtoBuilder.toString())).apply {
            if (cleanTo.isNotEmpty()) putExtra(Intent.EXTRA_EMAIL, arrayOf(cleanTo))
            if (cleanSubject.isNotEmpty()) putExtra(Intent.EXTRA_SUBJECT, cleanSubject)
            if (cleanBody.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, cleanBody)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return runCatching {
            context.startActivity(intent)
            ToolExecutionResult(
                "compose_email",
                true,
                "فتحتلك تطبيق الإيميل والتمبليت جاهز بالموضوع والنص — راجعه ودوس إرسال."
            )
        }.recoverCatching {
            val fallback = Intent(Intent.ACTION_SEND).apply {
                type = "message/rfc822"
                if (cleanTo.isNotEmpty()) putExtra(Intent.EXTRA_EMAIL, arrayOf(cleanTo))
                putExtra(Intent.EXTRA_SUBJECT, cleanSubject)
                putExtra(Intent.EXTRA_TEXT, cleanBody)
            }
            val chooser = Intent.createChooser(fallback, "إرسال الإيميل عبر").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)
            ToolExecutionResult("compose_email", true, "فتحتلك قائمة تطبيقات الإيميل والتمبليت جاهز.")
        }.getOrElse {
            ToolExecutionResult("compose_email", false, "ملقتش تطبيق إيميل متثبت على الموبايل.")
        }
    }

    /**
     * Saves a note locally in Omar's personal assistant Room database and optionally exports it to
     * Samsung Notes / Google Keep via official Android Note / Share Intents.
     */
    private suspend fun createPhoneNote(
        title: String,
        content: String,
        category: String,
        openInPhoneNotes: Boolean
    ): ToolExecutionResult {
        val cleanTitle = title.trim().ifEmpty { "ملاحظة سريعة" }
        val cleanContent = content.trim()
        if (cleanContent.isEmpty()) {
            return ToolExecutionResult("create_note", false, "مفيش نص واضح عشان أحفظه كنوت.")
        }

        val entity = NoteEntity(
            title = cleanTitle,
            content = cleanContent,
            category = category.ifBlank { "شخصي" }
        )
        noteDao.upsert(entity)

        if (openInPhoneNotes) {
            val exported = openNoteInExternalApp(cleanTitle, cleanContent)
            return if (exported.succeeded) {
                ToolExecutionResult(
                    "create_note",
                    true,
                    "حفظت النوت \"$cleanTitle\" جوه التطبيق وفتحتلك تطبيق الملاحظات على الموبايل عشان تحفظ نسخة هناك كمان."
                )
            } else {
                ToolExecutionResult(
                    "create_note",
                    true,
                    "حفظت النوت \"$cleanTitle\" في ملاحظات Omar's personal assistant بنجاح."
                )
            }
        }

        return ToolExecutionResult(
            "create_note",
            true,
            "حفظت النوت \"$cleanTitle\" في قسم الملاحظات."
        )
    }

    fun openNoteInExternalApp(title: String, content: String): ToolExecutionResult {
        val cleanTitle = title.trim()
        val cleanContent = content.trim()
        val combined = if (cleanTitle.isNotEmpty()) "$cleanTitle\n\n$cleanContent" else cleanContent

        // Try official Google/Android CREATE_NOTE action first (supported by Google Keep & compatible note apps)
        val createNoteIntent = Intent("com.google.android.gms.actions.CREATE_NOTE").apply {
            type = "text/plain"
            putExtra("com.google.android.gms.actions.EXTRA_NAME", cleanTitle)
            putExtra(Intent.EXTRA_SUBJECT, cleanTitle)
            putExtra(Intent.EXTRA_TEXT, cleanContent)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val pm = context.packageManager
        if (createNoteIntent.resolveActivity(pm) != null) {
            return runCatching {
                context.startActivity(createNoteIntent)
                ToolExecutionResult("create_note", true, "فتحتلك تطبيق الملاحظات بالنص جاهز.")
            }.getOrElse {
                shareNoteFallback(cleanTitle, combined)
            }
        }
        return shareNoteFallback(cleanTitle, combined)
    }

    private fun shareNoteFallback(title: String, combined: String): ToolExecutionResult {
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            if (title.isNotEmpty()) putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, combined)
        }
        val chooser = Intent.createChooser(sendIntent, "حفظ في Samsung Notes أو تطبيق الملاحظات").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return runCatching {
            context.startActivity(chooser)
            ToolExecutionResult("create_note", true, "فتحتلك قائمة التطبيقات (اختر Samsung Notes أو Keep للحفظ).")
        }.getOrElse {
            ToolExecutionResult("create_note", false, "مقدرتش أفتح تطبيق الملاحظات الخارجي.")
        }
    }

    /**
     * Looks up a contact phone number via ContactsContract ONLY if READ_CONTACTS is granted.
     */
    private fun lookupContactPhoneNumber(nameQuery: String): Pair<String, String>? {
        val cleanName = nameQuery.trim()
        if (cleanName.isEmpty()) return null
        val hasPerm = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) return null

        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        )
        val selection = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?"
        val selectionArgs = arrayOf("%$cleanName%")

        return runCatching {
            context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val displayName = cursor.getString(0) ?: cleanName
                    val number = cursor.getString(1) ?: ""
                    if (number.isNotBlank()) displayName to number else null
                } else {
                    null
                }
            }
        }.getOrNull()
    }

    /**
     * Normalizes Egyptian mobile numbers (e.g. 010xxxxxxxx -> 2010xxxxxxxx) for WhatsApp API URI.
     */
    private fun normalizeWhatsAppNumber(rawPhone: String): String {
        val digitsOnly = rawPhone.filter { it.isDigit() }
        if (digitsOnly.isEmpty()) return ""
        if (digitsOnly.startsWith("00")) return digitsOnly.drop(2)
        if (digitsOnly.length == 11 && digitsOnly.startsWith("01")) {
            return "20${digitsOnly.drop(1)}"
        }
        return digitsOnly
    }

    /**
     * Opens WhatsApp or Samsung Messages (SMS) pre-filled with recipient & message text.
     * Transparently respects Android & WhatsApp security rules: user taps final Send.
     */
    private fun sendMessage(
        channel: String,
        recipientName: String,
        rawPhoneNumber: String,
        messageText: String
    ): ToolExecutionResult {
        val cleanText = messageText.trim()
        if (cleanText.isEmpty()) {
            return ToolExecutionResult("send_message", false, "مفيش نص واضح للرسالة.")
        }

        var resolvedPhone = rawPhoneNumber.filter { it.isDigit() || it == '+' }
        var resolvedLabel = recipientName.trim()

        if (resolvedPhone.isBlank() && resolvedLabel.isNotEmpty()) {
            val hasContactsPerm = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_CONTACTS
            ) == PackageManager.PERMISSION_GRANTED
            if (hasContactsPerm) {
                val found = lookupContactPhoneNumber(resolvedLabel)
                if (found != null) {
                    resolvedLabel = found.first
                    resolvedPhone = found.second.filter { it.isDigit() || it == '+' }
                }
            } else {
                return ToolExecutionResult(
                    "send_message",
                    false,
                    "محتاج إذن جهات الاتصال عشان ألاقي رقم \"$resolvedLabel\" — أو اكتب رقمه مباشرة في خانة الرقم."
                )
            }
        }

        val normalizedChannel = channel.lowercase().trim()
        return if (normalizedChannel == "sms") {
            val smsUri = Uri.parse("smsto:${Uri.encode(resolvedPhone)}")
            val intent = Intent(Intent.ACTION_SENDTO, smsUri).apply {
                putExtra("sms_body", cleanText)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runCatching {
                context.startActivity(intent)
                val target = resolvedLabel.ifBlank { resolvedPhone.ifBlank { "المستلم" } }
                ToolExecutionResult(
                    "send_message",
                    true,
                    "فتحتلك تطبيق الرسائل (SMS) لـ $target والرسالة مكتوبة جاهزة — دوس إرسال."
                )
            }.getOrElse {
                ToolExecutionResult("send_message", false, "ملقتش تطبيق رسائل SMS متاح على الموبايل.")
            }
        } else {
            val waDigits = normalizeWhatsAppNumber(resolvedPhone)
            val encodedText = URLEncoder.encode(cleanText, "UTF-8")
            val waUri = if (waDigits.isNotEmpty()) {
                Uri.parse("https://api.whatsapp.com/send?phone=$waDigits&text=$encodedText")
            } else {
                Uri.parse("https://api.whatsapp.com/send?text=$encodedText")
            }
            val intent = Intent(Intent.ACTION_VIEW, waUri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runCatching {
                context.startActivity(intent)
                val target = resolvedLabel.ifBlank { resolvedPhone.ifBlank { "واتساب" } }
                ToolExecutionResult(
                    "send_message",
                    true,
                    "فتحتلك محادثة واتساب مع $target والرسالة مكتوبة جاهزة — دوس إرسال."
                )
            }.getOrElse {
                ToolExecutionResult("send_message", false, "مقدرتش أفتح واتساب على الموبايل. تأكد إنه متثبت.")
            }
        }
    }
}
