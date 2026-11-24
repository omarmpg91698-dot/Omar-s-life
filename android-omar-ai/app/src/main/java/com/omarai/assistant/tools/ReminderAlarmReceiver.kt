package com.omarai.assistant.tools

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.omarai.assistant.MainActivity
import com.omarai.assistant.data.local.OmarAiDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.ZonedDateTime

class ReminderAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_FIRE_REMINDER) return
        val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val fallbackTitle = intent.getStringExtra(EXTRA_REMINDER_TITLE) ?: "تذكير من Omar's personal assistant"

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = OmarAiDatabase.getInstance(context)
                val dao = db.reminderDao()
                val reminder = dao.getById(reminderId)
                val title = reminder?.title ?: fallbackTitle
                val recurrence = reminder?.recurrence ?: ReminderScheduleCalculator.RECURRENCE_ONCE

                postNotification(context, reminderId, title, recurrence)

                if (reminder != null && reminder.isEnabled) {
                    if (recurrence == ReminderScheduleCalculator.RECURRENCE_ONCE) {
                        dao.updateStatusAndNextTrigger(
                            id = reminder.id,
                            enabled = false,
                            nextTriggerMillis = reminder.nextTriggerMillis
                        )
                    } else {
                        val days = ReminderScheduleCalculator.parseDaysCsv(reminder.daysOfWeekCsv)
                        val nextMillis = ReminderScheduleCalculator.computeNextTriggerMillis(
                            hour = reminder.hour,
                            minute = reminder.minute,
                            recurrence = recurrence,
                            daysOfWeek = days,
                            now = ZonedDateTime.now().plusSeconds(5)
                        )
                        val updated = reminder.copy(
                            nextTriggerMillis = nextMillis,
                            updatedAt = System.currentTimeMillis()
                        )
                        dao.upsert(updated)
                        ReminderAlarmScheduler(context).schedule(updated)
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun postNotification(
        context: Context,
        reminderId: String,
        title: String,
        recurrence: String
    ) {
        ReminderWorker.ensureChannel(context)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            reminderId.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val subtitle = if (recurrence != ReminderScheduleCalculator.RECURRENCE_ONCE) {
            "تذكير متكرر من Omar's personal assistant"
        } else {
            "تذكير من Omar's personal assistant"
        }

        val notification = NotificationCompat.Builder(context, ReminderWorker.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(subtitle)
            .setContentText(title)
            .setStyle(NotificationCompat.BigTextStyle().bigText(title))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(reminderId.hashCode(), notification)
        }
    }

    companion object {
        const val ACTION_FIRE_REMINDER = "com.omarai.assistant.action.FIRE_REMINDER"
        const val EXTRA_REMINDER_ID = "extra_reminder_id"
        const val EXTRA_REMINDER_TITLE = "extra_reminder_title"
    }
}
