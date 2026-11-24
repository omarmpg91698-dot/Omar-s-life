package com.omarai.assistant.ui.viewmodel

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.omarai.assistant.AppContainer
import com.omarai.assistant.data.local.ConversationEntity
import com.omarai.assistant.data.local.MemoryEntity
import com.omarai.assistant.data.local.MessageEntity
import com.omarai.assistant.data.local.NoteEntity
import com.omarai.assistant.data.local.ReminderEntity
import com.omarai.assistant.data.local.ThemeMode
import com.omarai.assistant.data.local.UserPreferences
import com.omarai.assistant.data.remote.AdAuditRequest
import com.omarai.assistant.data.remote.AdPsychologyAuditResponse
import com.omarai.assistant.data.remote.ApiClientFactory
import com.omarai.assistant.data.remote.ApiErrorResponse
import com.omarai.assistant.data.remote.ChatHistoryItemDto
import com.omarai.assistant.data.remote.EgyptShopDto
import com.omarai.assistant.data.remote.GroundingSourceDto
import com.omarai.assistant.data.remote.MemorySnapshotDto
import com.omarai.assistant.data.remote.OmarAiChatRequest
import com.omarai.assistant.data.remote.TaskSnapshotDto
import com.omarai.assistant.data.remote.ToolCallDto
import com.omarai.assistant.tools.MediaUtils
import com.omarai.assistant.tools.ReminderScheduleCalculator
import com.omarai.assistant.tools.ToolExecutionResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.TimeZone
import java.util.UUID

data class PendingAttachment(
    val imageUri: Uri? = null,
    val docName: String? = null,
    val docText: String? = null
)

data class ChatUiState(
    val activeConversationId: String? = null,
    val specialistMode: String = "general",
    val isThinking: Boolean = false,
    val errorMessage: String? = null,
    val statusBanner: String? = null,
    val suggestedFollowUps: List<String> = emptyList(),
    val pendingConfirmations: List<ToolCallDto> = emptyList(),
    val lastToolResults: List<ToolExecutionResult> = emptyList(),
    val lastSources: List<GroundingSourceDto> = emptyList(),
    val lastPlaces: List<EgyptShopDto> = emptyList(),
    val pendingAttachment: PendingAttachment = PendingAttachment(),
    // Live Voice Call Mode
    val isLiveCallActive: Boolean = false,
    val isLiveCallMuted: Boolean = false,
    val liveCallState: String = "idle", // listening, thinking, speaking, muted, idle
    val liveCallLastUserText: String = "",
    val liveCallLastReplyText: String = "",
    // Ad & Copy Psychology Auditor
    val adAuditImageUri: Uri? = null,
    val adAuditLoading: Boolean = false,
    val adAuditError: String? = null,
    val adAuditResult: AdPsychologyAuditResponse? = null
)

@OptIn(ExperimentalCoroutinesApi::class)
class AssistantViewModel(
    private val app: Application,
    private val container: AppContainer
) : AndroidViewModel(app) {

    private val conversationDao = container.database.conversationDao()
    private val messageDao = container.database.messageDao()
    private val memoryDao = container.database.memoryDao()
    private val taskDao = container.database.taskDao()
    private val reminderDao = container.database.reminderDao()
    private val noteDao = container.database.noteDao()

    val preferences: StateFlow<UserPreferences> = container.preferencesRepository.preferencesFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UserPreferences())

    val conversations: StateFlow<List<ConversationEntity>> = conversationDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val memories: StateFlow<List<MemoryEntity>> = memoryDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val tasks = taskDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val reminders: StateFlow<List<ReminderEntity>> = reminderDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val notes: StateFlow<List<NoteEntity>> = noteDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val voiceInputState = container.speechRecognizerManager.state
    val isSpeaking = container.textToSpeechManager.isSpeaking

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    val activeMessages: StateFlow<List<MessageEntity>> = _uiState
        .flatMapLatest { state ->
            val id = state.activeConversationId
            if (id == null) flowOf(emptyList()) else messageDao.observeForConversation(id)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setSpecialistMode(mode: String) {
        _uiState.value = _uiState.value.copy(specialistMode = mode)
    }

    fun startNewConversation() {
        container.textToSpeechManager.stop()
        _uiState.value = ChatUiState(
            activeConversationId = null,
            specialistMode = _uiState.value.specialistMode
        )
    }

    fun selectConversation(conversationId: String) {
        container.textToSpeechManager.stop()
        _uiState.value = _uiState.value.copy(
            activeConversationId = conversationId,
            errorMessage = null,
            suggestedFollowUps = emptyList(),
            pendingConfirmations = emptyList(),
            lastToolResults = emptyList(),
            lastSources = emptyList(),
            lastPlaces = emptyList()
        )
    }

    fun deleteConversation(conversationId: String) {
        viewModelScope.launch {
            conversationDao.deleteById(conversationId)
            if (_uiState.value.activeConversationId == conversationId) {
                _uiState.value = ChatUiState(activeConversationId = null)
            }
        }
    }

    fun clearAllConversations() {
        viewModelScope.launch {
            conversationDao.deleteAll()
            _uiState.value = ChatUiState(activeConversationId = null)
        }
    }

    fun attachImage(uri: Uri) {
        _uiState.value = _uiState.value.copy(
            pendingAttachment = _uiState.value.pendingAttachment.copy(imageUri = uri),
            errorMessage = null
        )
    }

    fun attachDocument(uri: Uri) {
        viewModelScope.launch {
            val loaded = withContext(Dispatchers.IO) {
                MediaUtils.readSelectedTextDocument(app, uri)
            }
            if (loaded == null) {
                _uiState.value = _uiState.value.copy(
                    errorMessage = "مقدرتش أقرأ الملف ده. جرّب ملف نصي (TXT / MD / CSV / JSON)."
                )
            } else {
                _uiState.value = _uiState.value.copy(
                    pendingAttachment = _uiState.value.pendingAttachment.copy(
                        docName = loaded.first,
                        docText = loaded.second
                    ),
                    errorMessage = null
                )
            }
        }
    }

    fun clearAttachments() {
        _uiState.value = _uiState.value.copy(pendingAttachment = PendingAttachment())
    }

    fun toggleVoiceInput() {
        if (isSpeaking.value) {
            container.textToSpeechManager.stop()
        }
        if (voiceInputState.value.isListening) {
            container.speechRecognizerManager.stopListening()
            return
        }
        container.speechRecognizerManager.startListening(preferences.value.voiceLanguage) { transcript ->
            sendMessage(transcript)
        }
    }

    fun stopSpeaking() {
        container.textToSpeechManager.stop()
    }

    fun speakMessage(text: String, language: String = "ar-EG") {
        container.textToSpeechManager.speakNaturalEgyptian(
            text = text,
            preferredLang = language,
            backendBaseUrl = preferences.value.backendBaseUrl,
            scope = viewModelScope
        )
    }

    // Live Voice Call Mode (Hands-Free Continuous Egyptian Arabic Voice Conversation)
    fun startLiveVoiceCall() {
        container.textToSpeechManager.stop()
        container.speechRecognizerManager.stopListening()
        _uiState.value = _uiState.value.copy(
            isLiveCallActive = true,
            isLiveCallMuted = false,
            liveCallState = "listening",
            liveCallLastUserText = "",
            liveCallLastReplyText = ""
        )
        listenNextLiveCallTurn()
    }

    fun endLiveVoiceCall() {
        container.speechRecognizerManager.stopListening()
        container.textToSpeechManager.stop()
        _uiState.value = _uiState.value.copy(
            isLiveCallActive = false,
            isLiveCallMuted = false,
            liveCallState = "idle"
        )
    }

    fun toggleLiveCallMute() {
        val nextMuted = !_uiState.value.isLiveCallMuted
        if (nextMuted) {
            container.speechRecognizerManager.stopListening()
            _uiState.value = _uiState.value.copy(
                isLiveCallMuted = true,
                liveCallState = "muted"
            )
        } else {
            _uiState.value = _uiState.value.copy(
                isLiveCallMuted = false,
                liveCallState = "listening"
            )
            listenNextLiveCallTurn()
        }
    }

    fun interruptLiveCallAndListen() {
        container.textToSpeechManager.stop()
        if (_uiState.value.isLiveCallMuted) {
            _uiState.value = _uiState.value.copy(isLiveCallMuted = false)
        }
        _uiState.value = _uiState.value.copy(liveCallState = "listening")
        listenNextLiveCallTurn()
    }

    private fun listenNextLiveCallTurn() {
        if (!_uiState.value.isLiveCallActive || _uiState.value.isLiveCallMuted) return
        _uiState.value = _uiState.value.copy(liveCallState = "listening")
        container.speechRecognizerManager.startListening(preferences.value.voiceLanguage) { transcript ->
            if (!_uiState.value.isLiveCallActive) return@startListening
            _uiState.value = _uiState.value.copy(
                liveCallLastUserText = transcript,
                liveCallState = "thinking"
            )
            sendMessage(transcript)
        }
    }

    // Ad & Copy Psychology Auditor
    fun setAdAuditImage(uri: Uri) {
        _uiState.value = _uiState.value.copy(adAuditImageUri = uri, adAuditError = null)
    }

    fun clearAdAuditImage() {
        _uiState.value = _uiState.value.copy(adAuditImageUri = null)
    }

    fun runAdPsychologyAudit(adCopy: String, targetAudience: String, goal: String) {
        val cleanCopy = adCopy.trim()
        val imageUri = _uiState.value.adAuditImageUri
        if (cleanCopy.isEmpty() && imageUri == null) return
        if (_uiState.value.adAuditLoading) return

        if (!isNetworkAvailable()) {
            _uiState.value = _uiState.value.copy(
                adAuditError = "مفيش اتصال بالإنترنت حالياً. اتصل بالنت وجرّب تاني."
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(adAuditLoading = true, adAuditError = null)
            try {
                val imageDataUrl = imageUri?.let { uri ->
                    withContext(Dispatchers.IO) {
                        MediaUtils.compressImageUriToDataUrl(app, uri)
                    }
                }
                val api = ApiClientFactory.create(preferences.value.backendBaseUrl)
                val response = withContext(Dispatchers.IO) {
                    api.auditAd(
                        AdAuditRequest(
                            adCopy = cleanCopy,
                            imageDataUrl = imageDataUrl,
                            targetAudience = targetAudience,
                            goal = goal
                        )
                    )
                }
                if (!response.isSuccessful || response.body() == null) {
                    val errText = response.errorBody()?.string().orEmpty()
                    val parsedErr = runCatching {
                        ApiClientFactory.json.decodeFromString<ApiErrorResponse>(errText).message
                    }.getOrNull()
                    _uiState.value = _uiState.value.copy(
                        adAuditLoading = false,
                        adAuditError = parsedErr ?: "حصلت مشكلة في تحليل الإعلان (كود ${response.code()})."
                    )
                    return@launch
                }
                _uiState.value = _uiState.value.copy(
                    adAuditLoading = false,
                    adAuditResult = response.body()
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    adAuditLoading = false,
                    adAuditError = "حصل خطأ في الشبكة: ${e.localizedMessage ?: "جرّب تاني"}"
                )
            }
        }
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
        container.speechRecognizerManager.clearError()
    }

    fun dismissStatusBanner() {
        _uiState.value = _uiState.value.copy(statusBanner = null)
    }

    fun confirmToolCall(originalTool: ToolCallDto, editedTool: ToolCallDto = originalTool) {
        viewModelScope.launch {
            val result = container.phoneTools.execute(editedTool)
            _uiState.value = _uiState.value.copy(
                pendingConfirmations = _uiState.value.pendingConfirmations.filterNot { it == originalTool },
                lastToolResults = _uiState.value.lastToolResults + result,
                statusBanner = result.message
            )
        }
    }

    fun rejectToolCall(tool: ToolCallDto) {
        _uiState.value = _uiState.value.copy(
            pendingConfirmations = _uiState.value.pendingConfirmations.filterNot { it == tool },
            statusBanner = "تم إلغاء الإجراء بناءً على طلبك."
        )
    }

    fun schedulePreciseReminderDirect(
        title: String,
        hour: Int,
        minute: Int,
        recurrence: String,
        daysOfWeek: List<Int>
    ) {
        viewModelScope.launch {
            val result = container.phoneTools.schedulePreciseReminder(
                title = title,
                hour = hour,
                minute = minute,
                recurrence = recurrence,
                daysOfWeek = daysOfWeek
            )
            _uiState.value = _uiState.value.copy(statusBanner = result.message)
        }
    }

    fun toggleReminder(reminder: ReminderEntity, enabled: Boolean) {
        viewModelScope.launch {
            if (!enabled) {
                container.reminderAlarmScheduler.cancel(reminder.id)
                reminderDao.updateStatusAndNextTrigger(
                    id = reminder.id,
                    enabled = false,
                    nextTriggerMillis = reminder.nextTriggerMillis
                )
            } else {
                val days = ReminderScheduleCalculator.parseDaysCsv(reminder.daysOfWeekCsv)
                val nextTrigger = ReminderScheduleCalculator.computeNextTriggerMillis(
                    hour = reminder.hour,
                    minute = reminder.minute,
                    recurrence = reminder.recurrence,
                    daysOfWeek = days
                )
                val updated = reminder.copy(
                    isEnabled = true,
                    nextTriggerMillis = nextTrigger,
                    updatedAt = System.currentTimeMillis()
                )
                reminderDao.upsert(updated)
                container.reminderAlarmScheduler.schedule(updated)
            }
        }
    }

    fun deleteReminder(reminderId: String) {
        viewModelScope.launch {
            container.reminderAlarmScheduler.cancel(reminderId)
            reminderDao.deleteById(reminderId)
        }
    }

    fun sendMessage(rawText: String) {
        val text = rawText.trim()
        val attachment = _uiState.value.pendingAttachment
        if (text.isEmpty() && attachment.imageUri == null && attachment.docText == null) return
        if (_uiState.value.isThinking) return

        container.textToSpeechManager.stop()

        if (!isNetworkAvailable()) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "مفيش اتصال بالإنترنت حالياً. اتصل بالنت وجرّب تاني."
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isThinking = true,
                errorMessage = null,
                pendingConfirmations = emptyList(),
                lastToolResults = emptyList(),
                pendingAttachment = PendingAttachment()
            )

            try {
                val convId = ensureActiveConversation(
                    firstPrompt = text.ifEmpty { attachment.docName ?: "تحليل صورة" }
                )

                val userMessage = MessageEntity(
                    conversationId = convId,
                    role = "user",
                    content = text.ifEmpty {
                        when {
                            attachment.imageUri != null -> "اقرأ وحلّل الصورة دي"
                            attachment.docName != null -> "لخّصلي ملف: ${attachment.docName}"
                            else -> ""
                        }
                    },
                    imageUri = attachment.imageUri?.toString(),
                    attachmentName = attachment.docName
                )
                messageDao.insert(userMessage)
                conversationDao.touch(convId)

                val imageDataUrl = attachment.imageUri?.let { uri ->
                    withContext(Dispatchers.IO) {
                        MediaUtils.compressImageUriToDataUrl(app, uri)
                    }
                }

                val recentHistory = messageDao.getRecent(convId, limit = 10)
                    .reversed()
                    .dropLast(1)
                    .map { ChatHistoryItemDto(role = it.role, text = it.content) }

                val currentMemories = memoryDao.getAllSnapshot()
                    .map { MemorySnapshotDto(category = it.category, fact = it.fact) }

                val currentTasks = taskDao.getActiveSnapshot()
                    .map {
                        TaskSnapshotDto(
                            id = it.id,
                            title = it.title,
                            dueDateIso = it.dueDateIso,
                            completed = it.isCompleted
                        )
                    }

                val prefs = preferences.value
                val request = OmarAiChatRequest(
                    message = userMessage.content,
                    specialistMode = _uiState.value.specialistMode,
                    imageDataUrl = imageDataUrl,
                    attachedDocName = attachment.docName,
                    attachedDocText = attachment.docText,
                    history = recentHistory,
                    memories = currentMemories,
                    tasks = currentTasks,
                    userName = prefs.userName,
                    personalBio = prefs.privateBioEncrypted,
                    preferredLanguage = prefs.voiceLanguage,
                    deviceTimeIso = ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                    deviceTimeZone = TimeZone.getDefault().id
                )

                val api = ApiClientFactory.create(prefs.backendBaseUrl)
                val response = withContext(Dispatchers.IO) { api.sendChat(request) }

                if (!response.isSuccessful || response.body() == null) {
                    val errText = response.errorBody()?.string().orEmpty()
                    val parsedErr = runCatching {
                        ApiClientFactory.json.decodeFromString<ApiErrorResponse>(errText).message
                    }.getOrNull()
                    _uiState.value = _uiState.value.copy(
                        isThinking = false,
                        errorMessage = parsedErr ?: "حصلت مشكلة في الاتصال بالخادم (كود ${response.code()})."
                    )
                    return@launch
                }

                val payload = response.body()!!
                val autoExecuted = mutableListOf<ToolExecutionResult>()
                val needsConfirmation = mutableListOf<ToolCallDto>()

                for (tool in payload.toolCalls) {
                    val mustConfirm = tool.requiresConfirmation ||
                        tool.isSensitiveMemory ||
                        tool.type in setOf(
                            "dial_number",
                            "create_calendar_event",
                            "create_reminder",
                            "open_app",
                            "open_website",
                            "save_memory",
                            "compose_email",
                            "create_note",
                            "send_message"
                        )
                    if (mustConfirm) {
                        needsConfirmation.add(tool)
                    } else {
                        autoExecuted.add(container.phoneTools.execute(tool))
                    }
                }

                val assistantMsg = MessageEntity(
                    conversationId = convId,
                    role = "assistant",
                    content = payload.reply,
                    language = payload.language
                )
                messageDao.insert(assistantMsg)
                conversationDao.touch(convId)

                val inLiveCall = _uiState.value.isLiveCallActive
                _uiState.value = _uiState.value.copy(
                    isThinking = false,
                    suggestedFollowUps = payload.suggestedFollowUps,
                    pendingConfirmations = needsConfirmation,
                    lastToolResults = autoExecuted,
                    lastSources = payload.sources,
                    lastPlaces = payload.places,
                    liveCallLastReplyText = if (inLiveCall) payload.reply else _uiState.value.liveCallLastReplyText,
                    liveCallState = if (inLiveCall) "speaking" else _uiState.value.liveCallState
                )

                if (inLiveCall || prefs.autoSpeakReplies) {
                    container.textToSpeechManager.speakNaturalEgyptian(
                        text = payload.reply,
                        preferredLang = payload.language,
                        backendBaseUrl = prefs.backendBaseUrl,
                        scope = viewModelScope,
                        onComplete = {
                            if (_uiState.value.isLiveCallActive && !_uiState.value.isLiveCallMuted) {
                                viewModelScope.launch {
                                    listenNextLiveCallTurn()
                                }
                            }
                        }
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isThinking = false,
                    liveCallState = if (_uiState.value.isLiveCallActive) "idle" else _uiState.value.liveCallState,
                    errorMessage = "حصل خطأ في الشبكة: ${e.localizedMessage ?: "تأكد من الاتصال وجرّب تاني"}"
                )
            }
        }
    }

    private suspend fun ensureActiveConversation(firstPrompt: String): String {
        val current = _uiState.value.activeConversationId
        if (current != null) return current
        val newId = UUID.randomUUID().toString()
        val cleanTitle = firstPrompt.trim().replace("\n", " ").take(42).ifEmpty { "محادثة جديدة" }
        conversationDao.upsert(ConversationEntity(id = newId, title = cleanTitle))
        _uiState.value = _uiState.value.copy(activeConversationId = newId)
        return newId
    }

    // Memory CRUD
    fun addMemory(category: String, fact: String) {
        val clean = fact.trim()
        if (clean.isEmpty()) return
        viewModelScope.launch {
            memoryDao.upsert(MemoryEntity(category = category, fact = clean))
        }
    }

    fun updateMemory(memory: MemoryEntity, newCategory: String, newFact: String) {
        val clean = newFact.trim()
        if (clean.isEmpty()) return
        viewModelScope.launch {
            memoryDao.update(
                memory.copy(
                    category = newCategory,
                    fact = clean,
                    updatedAt = System.currentTimeMillis()
                )
            )
        }
    }

    fun deleteMemory(id: String) {
        viewModelScope.launch { memoryDao.deleteById(id) }
    }

    fun toggleTask(taskId: String, completed: Boolean) {
        viewModelScope.launch { taskDao.setCompleted(taskId, completed) }
    }

    // Phone Notes CRUD + Export to Samsung Notes / Google Keep
    fun addNote(title: String, content: String, category: String = "شخصي") {
        val cleanContent = content.trim()
        if (cleanContent.isEmpty()) return
        val cleanTitle = title.trim().ifEmpty { "ملاحظة سريعة" }
        viewModelScope.launch {
            noteDao.upsert(
                NoteEntity(
                    title = cleanTitle,
                    content = cleanContent,
                    category = category
                )
            )
            _uiState.value = _uiState.value.copy(statusBanner = "اتحفظت الملاحظة \"$cleanTitle\".")
        }
    }

    fun deleteNote(id: String) {
        viewModelScope.launch { noteDao.deleteById(id) }
    }

    fun exportNoteToPhoneApps(note: NoteEntity) {
        val result = container.phoneTools.openNoteInExternalApp(note.title, note.content)
        _uiState.value = _uiState.value.copy(statusBanner = result.message)
    }

    // Settings updates
    fun updateUserName(name: String) = viewModelScope.launch {
        container.preferencesRepository.updateUserName(name)
    }

    fun updateThemeMode(mode: ThemeMode) = viewModelScope.launch {
        container.preferencesRepository.updateThemeMode(mode)
    }

    fun updateVoiceLanguage(lang: String) = viewModelScope.launch {
        container.preferencesRepository.updateVoiceLanguage(lang)
    }

    fun updateAutoSpeak(enabled: Boolean) = viewModelScope.launch {
        container.preferencesRepository.updateAutoSpeak(enabled)
    }

    fun updateBackendUrl(url: String) = viewModelScope.launch {
        container.preferencesRepository.updateBackendUrl(url)
    }

    fun updatePrivateBio(bio: String) = viewModelScope.launch {
        container.preferencesRepository.updateEncryptedPrivateBio(bio)
    }

    fun wipeAllLocalData() = viewModelScope.launch {
        val existing = reminderDao.getEnabledSnapshot()
        existing.forEach { container.reminderAlarmScheduler.cancel(it.id) }
        conversationDao.deleteAll()
        memoryDao.deleteAll()
        taskDao.deleteAll()
        reminderDao.deleteAll()
        noteDao.deleteAll()
        container.preferencesRepository.clearEncryptedVault()
        _uiState.value = ChatUiState(statusBanner = "تم مسح كل المحادثات والذكريات والملاحظات والتذكيرات بأمان.")
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}

class AssistantViewModelFactory(
    private val application: Application,
    private val container: AppContainer
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return AssistantViewModel(application, container) as T
    }
}
