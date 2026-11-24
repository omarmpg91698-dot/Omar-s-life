package com.omarai.assistant.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.OpenInBrowser
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import androidx.compose.ui.res.painterResource
import com.omarai.assistant.R
import com.omarai.assistant.data.local.MessageEntity
import com.omarai.assistant.data.local.ReminderEntity
import com.omarai.assistant.data.remote.EgyptShopDto
import com.omarai.assistant.data.remote.GroundingSourceDto
import com.omarai.assistant.data.remote.ToolCallDto
import com.omarai.assistant.tools.MediaUtils
import com.omarai.assistant.tools.ReminderScheduleCalculator
import com.omarai.assistant.ui.viewmodel.AssistantViewModel
import java.time.DayOfWeek
import java.util.Calendar

private val SPECIALIST_MODES = listOf(
    "general" to "مساعد عام",
    "psychology" to "علم النفس",
    "marketing" to "التسويق",
    "egypt_shops" to "محلات مصر"
)

private fun quickPromptsForMode(mode: String): List<String> = when (mode) {
    "psychology" -> listOf(
        "اشرحلي بالمصري نظرية التنافر المعرفي وإزاي بتأثر على قراراتي",
        "إيه أشهر دراسات علم النفس عن التسويف وإزاي أتغلب عليه؟",
        "اشرحلي التفكير السريع والبطيء لكانمان بأمثلة من حياتنا",
        "إزاي أبني عادة جديدة حسب نموذج BJ Fogg؟"
    )
    "marketing" -> listOf(
        "إزاي أطبق مبادئ سيالديني الستة في إعلان للسوق المصري؟",
        "إيه أحدث استراتيجيات تسعير المنتجات نفسياً من النت؟",
        "اكتبلي Hook إعلاني قوي باستخدام Loss Aversion",
        "إزاي أزود التحويل في متجر إلكتروني في مصر؟"
    )
    "egypt_shops" -> listOf(
        "أحسن محلات لابتوب وكمبيوتر في مول البستان وسط البلد",
        "أماكن محلات لبس رجالي شيك في مدينة نصر أو المعادي",
        "أقرب كافيهات هادية للشغل في التجمع الخامس",
        "أشهر محلات هدايا وإكسسوارات في الشيخ زايد"
    )
    else -> listOf(
        "فكّرني كل يوم الساعة ٨ الصبح أراجع خطة يومي",
        "اشرحلي بالمصري سيكولوجية التسعير في التسويق",
        "دورلي على أحسن كافيهات للشغل في المعادي",
        "رتّبلي يومي النهارده"
    )
}

private val RECURRENCE_OPTIONS = listOf(
    ReminderScheduleCalculator.RECURRENCE_ONCE to "مرة واحدة",
    ReminderScheduleCalculator.RECURRENCE_DAILY to "كل يوم",
    ReminderScheduleCalculator.RECURRENCE_WEEKLY to "أسبوعياً",
    ReminderScheduleCalculator.RECURRENCE_MONTHLY to "شهرياً"
)

private val ARABIC_WEEKDAYS = listOf(
    DayOfWeek.SATURDAY.value to "السبت",
    DayOfWeek.SUNDAY.value to "الأحد",
    DayOfWeek.MONDAY.value to "الإثنين",
    DayOfWeek.TUESDAY.value to "الثلاثاء",
    DayOfWeek.WEDNESDAY.value to "الأربعاء",
    DayOfWeek.THURSDAY.value to "الخميس",
    DayOfWeek.FRIDAY.value to "الجمعة"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeChatScreen(
    viewModel: AssistantViewModel,
    onOpenDrawer: () -> Unit,
    onOpenMemory: () -> Unit,
    onOpenAuditor: () -> Unit
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val messages by viewModel.activeMessages.collectAsState()
    val conversations by viewModel.conversations.collectAsState()
    val reminders by viewModel.reminders.collectAsState()
    val prefs by viewModel.preferences.collectAsState()
    val voiceState by viewModel.voiceInputState.collectAsState()
    val isSpeaking by viewModel.isSpeaking.collectAsState()

    var inputText by remember { mutableStateOf("") }
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    var showReminderDialog by remember { mutableStateOf(false) }
    var showRemindersManager by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size, uiState.isThinking) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) viewModel.toggleVoiceInput()
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> }

    var pendingContactsToolPair by remember { mutableStateOf<Pair<ToolCallDto, ToolCallDto>?>(null) }
    val contactsPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ ->
        val pair = pendingContactsToolPair
        pendingContactsToolPair = null
        if (pair != null) {
            viewModel.confirmToolCall(pair.first, pair.second)
        }
    }

    val takePictureLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val uri = pendingCameraUri
        if (success && uri != null) {
            viewModel.attachImage(uri)
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val uri = MediaUtils.createCameraImageUri(context)
            pendingCameraUri = uri
            takePictureLauncher.launch(uri)
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) viewModel.attachImage(uri)
    }

    val documentPickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) viewModel.attachDocument(uri)
    }

    fun requestMicAndListen() {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            viewModel.toggleVoiceInput()
        } else {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun requestMicAndStartLiveCall() {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            viewModel.startLiveVoiceCall()
        } else {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun requestCameraAndCapture() {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            val uri = MediaUtils.createCameraImageUri(context)
            pendingCameraUri = uri
            takePictureLauncher.launch(uri)
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val notifGranted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!notifGranted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    val activeRemindersCount = remember(reminders) { reminders.count { it.isEnabled } }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                ),
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Rounded.Menu, contentDescription = "القائمة")
                    }
                },
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.omar_logo),
                            contentDescription = "Omar's personal assistant",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                        )
                        Text(
                            text = "Omar's personal assistant",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                actions = {
                    if (isSpeaking) {
                        IconButton(onClick = { viewModel.stopSpeaking() }) {
                            Icon(
                                Icons.Rounded.Stop,
                                contentDescription = "إيقاف الصوت",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                    IconButton(onClick = { requestMicAndStartLiveCall() }) {
                        Icon(
                            Icons.Rounded.Call,
                            contentDescription = "مكالمة صوتية حية بالمصري",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    IconButton(onClick = onOpenAuditor) {
                        Icon(
                            Icons.Rounded.Campaign,
                            contentDescription = "محلّل الإعلانات بالسيكولوجي"
                        )
                    }
                    IconButton(onClick = { showRemindersManager = true }) {
                        Icon(
                            Icons.Rounded.Alarm,
                            contentDescription = "التذكيرات المتكررة ($activeRemindersCount)",
                            tint = if (activeRemindersCount > 0) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            }
                        )
                    }
                    IconButton(onClick = onOpenMemory) {
                        Icon(Icons.Rounded.Psychology, contentDescription = "ذاكرتي")
                    }
                    IconButton(onClick = { viewModel.startNewConversation() }) {
                        Icon(Icons.Rounded.Add, contentDescription = "محادثة جديدة")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
                .navigationBarsPadding()
        ) {
            val activeError = uiState.errorMessage ?: voiceState.error
            AnimatedVisibility(visible = activeError != null) {
                if (activeError != null) {
                    Surface(
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = activeError,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = { viewModel.dismissError() }) {
                                Icon(Icons.Rounded.Close, contentDescription = "إغلاق")
                            }
                        }
                    }
                }
            }

            AnimatedVisibility(visible = uiState.statusBanner != null) {
                val banner = uiState.statusBanner
                if (banner != null) {
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = banner,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = { viewModel.dismissStatusBanner() }) {
                                Icon(Icons.Rounded.Close, contentDescription = "إغلاق")
                            }
                        }
                    }
                }
            }

            // Specialist Mode Filter Bar (General / Psychology / Marketing / Egypt Shops)
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(SPECIALIST_MODES) { (code, label) ->
                    FilterChip(
                        selected = uiState.specialistMode == code,
                        onClick = { viewModel.setSpecialistMode(code) },
                        label = { Text(label) }
                    )
                }
            }

            if (messages.isEmpty()) {
                MuseWelcomeHero(
                    userName = prefs.userName,
                    specialistMode = uiState.specialistMode,
                    isListening = voiceState.isListening,
                    partialTranscript = voiceState.partialText,
                    recentConversations = conversations.take(3),
                    onMicClick = { requestMicAndListen() },
                    onStartLiveCall = { requestMicAndStartLiveCall() },
                    onOpenAuditor = onOpenAuditor,
                    onQuickPrompt = { prompt -> viewModel.sendMessage(prompt) },
                    onSelectConversation = { id -> viewModel.selectConversation(id) },
                    modifier = Modifier.weight(1f)
                )
            } else {
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    items(messages, key = { it.id }) { msg ->
                        MessageBubble(
                            message = msg,
                            onSpeak = { viewModel.speakMessage(msg.content, msg.language) }
                        )
                    }

                    if (uiState.lastPlaces.isNotEmpty() && !uiState.isThinking) {
                        item(key = "egypt_places") {
                            EgyptPlacesResultSection(
                                places = uiState.lastPlaces,
                                onOpenUrl = { url ->
                                    runCatching {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                    }
                                }
                            )
                        }
                    }

                    if (uiState.lastSources.isNotEmpty() && !uiState.isThinking) {
                        item(key = "grounding_sources") {
                            GroundingSourcesSection(
                                sources = uiState.lastSources,
                                onOpenUrl = { url ->
                                    runCatching {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                    }
                                }
                            )
                        }
                    }

                    if (uiState.isThinking) {
                        item(key = "thinking") {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.padding(vertical = 6.dp)
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp
                                )
                                Text(
                                    text = "Omar's personal assistant بيفكّر وبيبحثلك...",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    if (uiState.pendingConfirmations.isNotEmpty()) {
                        items(uiState.pendingConfirmations) { tool ->
                            ToolConfirmationCard(
                                tool = tool,
                                onConfirm = { edited ->
                                    val needsContactsLookup =
                                        edited.type == "send_message" &&
                                            edited.phoneNumber.isNullOrBlank() &&
                                            !edited.recipientName.isNullOrBlank() &&
                                            ContextCompat.checkSelfPermission(
                                                context,
                                                Manifest.permission.READ_CONTACTS
                                            ) != PackageManager.PERMISSION_GRANTED
                                    if (needsContactsLookup) {
                                        pendingContactsToolPair = tool to edited
                                        contactsPermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
                                    } else {
                                        viewModel.confirmToolCall(tool, edited)
                                    }
                                },
                                onReject = { viewModel.rejectToolCall(tool) }
                            )
                        }
                    }

                    if (uiState.suggestedFollowUps.isNotEmpty() && !uiState.isThinking) {
                        item(key = "followups") {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.padding(top = 4.dp)
                            ) {
                                items(uiState.suggestedFollowUps) { suggestion ->
                                    OutlinedButton(
                                        onClick = { viewModel.sendMessage(suggestion) },
                                        shape = RoundedCornerShape(14.dp)
                                    ) {
                                        Text(
                                            text = suggestion,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            AnimatedVisibility(visible = voiceState.isListening) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Rounded.GraphicEq,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = voiceState.partialText.ifBlank { "سامعك... اتكلم دلوقتي" },
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            val attachment = uiState.pendingAttachment
            if (attachment.imageUri != null || attachment.docName != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(8.dp)
                ) {
                    if (attachment.imageUri != null) {
                        AsyncImage(
                            model = attachment.imageUri,
                            contentDescription = "صورة مرفقة",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(10.dp))
                        )
                    }
                    Text(
                        text = attachment.docName ?: "صورة جاهزة للتحليل",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    IconButton(onClick = { viewModel.clearAttachments() }) {
                        Icon(Icons.Rounded.Close, contentDescription = "إزالة المرفق")
                    }
                }
            }

            // Bottom Composer Bar with Precise Reminder Time Picker trigger
            Surface(
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp,
                shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp)
                ) {
                    IconButton(onClick = { showReminderDialog = true }) {
                        Icon(
                            Icons.Rounded.Schedule,
                            contentDescription = "جدولة تذكير بوقت محدد",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    IconButton(onClick = { requestCameraAndCapture() }) {
                        Icon(Icons.Rounded.CameraAlt, contentDescription = "تصوير بالكاميرا")
                    }
                    IconButton(
                        onClick = {
                            photoPickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        }
                    ) {
                        Icon(Icons.Rounded.Image, contentDescription = "اختيار صورة")
                    }
                    IconButton(
                        onClick = {
                            documentPickerLauncher.launch(arrayOf("text/*", "application/json"))
                        }
                    ) {
                        Icon(Icons.Rounded.AttachFile, contentDescription = "إرفاق ملف نصي")
                    }

                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("اكتب أو اتكلم مع Omar's personal assistant...") },
                        singleLine = false,
                        maxLines = 4,
                        shape = RoundedCornerShape(18.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline
                        ),
                        modifier = Modifier.weight(1f)
                    )

                    val hasContent = inputText.isNotBlank() ||
                        attachment.imageUri != null ||
                        attachment.docText != null

                    if (hasContent) {
                        FilledIconButton(
                            onClick = {
                                val toSend = inputText
                                inputText = ""
                                viewModel.sendMessage(toSend)
                            },
                            enabled = !uiState.isThinking,
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = "إرسال")
                        }
                    } else {
                        FilledIconButton(
                            onClick = { requestMicAndListen() },
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = if (voiceState.isListening) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    MaterialTheme.colorScheme.primary
                                }
                            ),
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(
                                imageVector = if (voiceState.isListening) Icons.Rounded.Stop else Icons.Rounded.Mic,
                                contentDescription = "التحدث بالصوت"
                            )
                        }
                    }
                }
            }
        }
    }

    if (showReminderDialog) {
        PreciseReminderPickerDialog(
            initialTitle = inputText.trim(),
            onDismiss = { showReminderDialog = false },
            onSchedule = { title, hour, minute, recurrence, days ->
                viewModel.schedulePreciseReminderDirect(title, hour, minute, recurrence, days)
                inputText = ""
                showReminderDialog = false
            }
        )
    }

    if (showRemindersManager) {
        ActiveRemindersDialog(
            reminders = reminders,
            onToggle = { reminder, enabled -> viewModel.toggleReminder(reminder, enabled) },
            onDelete = { id -> viewModel.deleteReminder(id) },
            onAddNew = {
                showRemindersManager = false
                showReminderDialog = true
            },
            onDismiss = { showRemindersManager = false }
        )
    }

    if (uiState.isLiveCallActive) {
        LiveVoiceCallOverlay(
            userName = prefs.userName,
            specialistMode = uiState.specialistMode,
            callState = uiState.liveCallState,
            isMuted = uiState.isLiveCallMuted,
            rmsDb = voiceState.rmsDb,
            partialTranscript = voiceState.partialText,
            lastUserText = uiState.liveCallLastUserText,
            lastReplyText = uiState.liveCallLastReplyText,
            onSelectMode = { mode -> viewModel.setSpecialistMode(mode) },
            onOrbTap = { viewModel.interruptLiveCallAndListen() },
            onToggleMute = { viewModel.toggleLiveCallMute() },
            onEndCall = { viewModel.endLiveVoiceCall() }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PreciseReminderPickerDialog(
    initialTitle: String,
    initialHour: Int = 8,
    initialMinute: Int = 0,
    initialRecurrence: String = ReminderScheduleCalculator.RECURRENCE_DAILY,
    initialDays: List<Int> = emptyList(),
    onDismiss: () -> Unit,
    onSchedule: (title: String, hour: Int, minute: Int, recurrence: String, days: List<Int>) -> Unit
) {
    var title by remember { mutableStateOf(initialTitle) }
    var recurrence by remember { mutableStateOf(initialRecurrence) }
    var selectedDays by remember { mutableStateOf(initialDays.toSet()) }
    val timePickerState = rememberTimePickerState(
        initialHour = initialHour,
        initialMinute = initialMinute,
        is24Hour = false
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("جدولة تذكير بوقت دقيق") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("عنوان التذكير") },
                    placeholder = { Text("مثلاً: مراجعة خطة اليوم أو أخذ الدواء") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Text(
                    text = "اختار الوقت بالظبط",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    TimePicker(state = timePickerState)
                }

                Text(
                    text = "التكرار",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(RECURRENCE_OPTIONS) { (code, label) ->
                        FilterChip(
                            selected = recurrence == code,
                            onClick = { recurrence = code },
                            label = { Text(label) }
                        )
                    }
                }

                if (recurrence == ReminderScheduleCalculator.RECURRENCE_WEEKLY) {
                    Text(
                        text = "أيام الأسبوع",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(ARABIC_WEEKDAYS) { (isoDay, label) ->
                            val active = isoDay in selectedDays
                            FilterChip(
                                selected = active,
                                onClick = {
                                    selectedDays = if (active) selectedDays - isoDay else selectedDays + isoDay
                                },
                                label = { Text(label) }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSchedule(
                        title.trim(),
                        timePickerState.hour,
                        timePickerState.minute,
                        recurrence,
                        selectedDays.sorted()
                    )
                },
                enabled = title.trim().isNotEmpty()
            ) {
                Text("جدولة التذكير")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("إلغاء")
            }
        }
    )
}

@Composable
private fun ActiveRemindersDialog(
    reminders: List<ReminderEntity>,
    onToggle: (ReminderEntity, Boolean) -> Unit,
    onDelete: (String) -> Unit,
    onAddNew: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("التذكيرات المجدولة (${reminders.size})") },
        text = {
            if (reminders.isEmpty()) {
                Text(
                    text = "مفيش تذكيرات مجدولة دلوقتي. تقدر تقول لـ Omar's personal assistant مثلاً: \"فكّرني كل يوم الساعة ٨ الصبح\" أو تضغط زر الساعة في المحادثة.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(reminders, key = { it.id }) { reminder ->
                        val days = ReminderScheduleCalculator.parseDaysCsv(reminder.daysOfWeekCsv)
                        val timeText = ReminderScheduleCalculator.formatTimeArabic12(reminder.hour, reminder.minute)
                        val recText = ReminderScheduleCalculator.formatRecurrenceLabelArabic(reminder.recurrence, days)

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = reminder.title,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "$recText · $timeText",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                Switch(
                                    checked = reminder.isEnabled,
                                    onCheckedChange = { onToggle(reminder, it) }
                                )
                                IconButton(onClick = { onDelete(reminder.id) }) {
                                    Icon(
                                        Icons.Rounded.Delete,
                                        contentDescription = "حذف التذكير",
                                        tint = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onAddNew) {
                Text("تذكير جديد")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("إغلاق")
            }
        }
    )
}

@Composable
private fun MuseWelcomeHero(
    userName: String,
    specialistMode: String,
    isListening: Boolean,
    partialTranscript: String,
    recentConversations: List<com.omarai.assistant.data.local.ConversationEntity>,
    onMicClick: () -> Unit,
    onStartLiveCall: () -> Unit,
    onOpenAuditor: () -> Unit,
    onQuickPrompt: (String) -> Unit,
    onSelectConversation: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val prompts = remember(specialistMode) { quickPromptsForMode(specialistMode) }
    val greeting = remember(userName) {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val prefix = when {
            hour < 12 -> "صباح الخير"
            hour < 18 -> "مساء الفل"
            else -> "مساء الخير"
        }
        "$prefix يا $userName"
    }

    val pulseTransition = rememberInfiniteTransition(label = "voice_pulse")
    val pulseScale by pulseTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isListening) 1.14f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(700),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(22.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = greeting,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "أقدر أساعدك في إيه؟",
                style = MaterialTheme.typography.headlineLarge,
                textAlign = TextAlign.Center
            )
        }

        item {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.padding(vertical = 10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(124.dp)
                        .scale(pulseScale)
                        .clip(CircleShape)
                        .background(
                            MaterialTheme.colorScheme.primary.copy(
                                alpha = if (isListening) 0.24f else 0.10f
                            )
                        )
                )
                FilledIconButton(
                    onClick = onMicClick,
                    shape = CircleShape,
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (isListening) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        }
                    ),
                    modifier = Modifier.size(88.dp)
                ) {
                    Icon(
                        imageVector = if (isListening) Icons.Rounded.Stop else Icons.Rounded.Mic,
                        contentDescription = "اضغط للتحدث",
                        modifier = Modifier.size(38.dp)
                    )
                }
            }
            Text(
                text = if (isListening) {
                    partialTranscript.ifBlank { "سامعك دلوقتي..." }
                } else {
                    "اضغط واتكلم بالمصري أو الإنجليزي"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(onClick = onStartLiveCall, shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Rounded.Call, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("مكالمة حية")
                }
                OutlinedButton(onClick = onOpenAuditor, shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Rounded.Campaign, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("محلّل الإعلانات")
                }
            }
        }

        item {
            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                prompts.forEach { prompt ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onQuickPrompt(prompt) }
                    ) {
                        Text(
                            text = prompt,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)
                        )
                    }
                }
            }
        }

        if (recentConversations.isNotEmpty()) {
            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "آخر محادثاتك",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    recentConversations.forEach { conv ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onSelectConversation(conv.id) }
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = conv.title,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(
    message: MessageEntity,
    onSpeak: () -> Unit
) {
    val isUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = if (isUser) 18.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 18.dp
            ),
            color = if (isUser) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.surface
            },
            border = if (isUser) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.widthIn(max = 310.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                if (!message.imageUri.isNullOrBlank()) {
                    AsyncImage(
                        model = Uri.parse(message.imageUri),
                        contentDescription = "صورة مرفقة",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(170.dp)
                            .clip(RoundedCornerShape(12.dp))
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (isUser) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    }
                )
                if (!isUser) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                        IconButton(
                            onClick = onSpeak,
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                Icons.Rounded.VolumeUp,
                                contentDescription = "اسمع الرد",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EgyptPlacesResultSection(
    places: List<EgyptShopDto>,
    onOpenUrl: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "أماكن ومحلات موثقة في مصر (Google Maps)",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )
        places.forEach { place ->
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = place.name,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        if (place.rating != null) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Rounded.Star,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(3.dp))
                                Text(
                                    text = String.format("%.1f", place.rating),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                    Text(
                        text = place.address,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (!place.phone.isNullOrBlank()) {
                        Text(
                            text = place.phone,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    if (!place.googleMapsUri.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Button(
                            onClick = { onOpenUrl(place.googleMapsUri) },
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(
                                Icons.Rounded.LocationOn,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("فتح الموقع على خرائط Google")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GroundingSourcesSection(
    sources: List<GroundingSourceDto>,
    onOpenUrl: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = "مصادر موثقة من الإنترنت والخرائط",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(sources) { src ->
                OutlinedButton(
                    onClick = { onOpenUrl(src.uri) },
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = if (src.kind == "maps") Icons.Rounded.LocationOn else Icons.Rounded.OpenInBrowser,
                        contentDescription = null,
                        modifier = Modifier.size(15.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = src.title,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = 180.dp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ToolConfirmationCard(
    tool: ToolCallDto,
    onConfirm: (ToolCallDto) -> Unit,
    onReject: () -> Unit
) {
    val isReminder = tool.type == "create_reminder"
    val isEmail = tool.type == "compose_email"
    val isNote = tool.type == "create_note"
    val isMessage = tool.type == "send_message"

    val parsed = remember(tool.reminderTime) {
        ReminderScheduleCalculator.parseTime24(tool.reminderTime) ?: (8 to 0)
    }

    var editedHour by remember(tool) { mutableIntStateOf(parsed.first) }
    var editedMinute by remember(tool) { mutableIntStateOf(parsed.second) }
    var editedRecurrence by remember(tool) {
        mutableStateOf(ReminderScheduleCalculator.normalizeRecurrence(tool.recurrence))
    }
    var editedDays by remember(tool) {
        mutableStateOf(tool.daysOfWeek.orEmpty().toSet())
    }
    var showInlineTimePicker by remember { mutableStateOf(false) }

    // Inline editable state for Email, Note, and WhatsApp/SMS Message
    var emailTo by remember(tool) { mutableStateOf(tool.recipientEmail.orEmpty()) }
    var emailSubject by remember(tool) { mutableStateOf(tool.subject.orEmpty()) }
    var emailBody by remember(tool) { mutableStateOf(tool.body.orEmpty()) }

    var noteTitle by remember(tool) { mutableStateOf(tool.title.orEmpty()) }
    var noteContent by remember(tool) { mutableStateOf(tool.content ?: tool.description.orEmpty()) }
    var noteExportExternal by remember(tool) { mutableStateOf(tool.openInPhoneNotes) }

    var msgChannel by remember(tool) { mutableStateOf(tool.channel ?: "whatsapp") }
    var msgRecipient by remember(tool) { mutableStateOf(tool.recipientName.orEmpty()) }
    var msgPhone by remember(tool) { mutableStateOf(tool.phoneNumber.orEmpty()) }
    var msgText by remember(tool) { mutableStateOf(tool.messageText ?: tool.body.orEmpty()) }

    val cardHeader = when {
        isReminder -> "تأكيد وضبط وقت التذكير"
        isEmail -> "مراجعة تمبليت الإيميل قبل الفتح في Gmail"
        isNote -> "مراجعة الملاحظة قبل الحفظ على الموبايل"
        isMessage -> "مراجعة الرسالة قبل الفتح في واتساب / SMS"
        else -> "تأكيد قبل التنفيذ"
    }

    val confirmLabel = when {
        isReminder -> "تأكيد وجدولة"
        isEmail -> "فتح في الإيميل"
        isNote -> if (noteExportExternal) "حفظ + فتح في Samsung Notes" else "حفظ الملاحظة"
        isMessage -> if (msgChannel == "sms") "فتح في الرسائل (SMS)" else "فتح في واتساب"
        else -> "موافق"
    }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = cardHeader,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = tool.confirmationPrompt.ifBlank {
                    "تسمحلي أنفّذ الإجراء ده (${tool.type})؟"
                },
                style = MaterialTheme.typography.bodyMedium
            )

            if (isEmail) {
                OutlinedTextField(
                    value = emailTo,
                    onValueChange = { emailTo = it },
                    label = { Text("إلى (الإيميل)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = emailSubject,
                    onValueChange = { emailSubject = it },
                    label = { Text("الموضوع (Subject)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = emailBody,
                    onValueChange = { emailBody = it },
                    label = { Text("نص الإيميل") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            if (isNote) {
                OutlinedTextField(
                    value = noteTitle,
                    onValueChange = { noteTitle = it },
                    label = { Text("عنوان الملاحظة") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = noteContent,
                    onValueChange = { noteContent = it },
                    label = { Text("المحتوى") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterChip(
                            selected = !noteExportExternal,
                            onClick = { noteExportExternal = false },
                            label = { Text("حفظ داخل Omar's personal assistant") }
                        )
                    }
                    item {
                        FilterChip(
                            selected = noteExportExternal,
                            onClick = { noteExportExternal = true },
                            label = { Text("حفظ + فتح في Samsung Notes / Keep") }
                        )
                    }
                }
            }

            if (isMessage) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterChip(
                            selected = msgChannel == "whatsapp",
                            onClick = { msgChannel = "whatsapp" },
                            label = { Text("واتساب (WhatsApp)") }
                        )
                    }
                    item {
                        FilterChip(
                            selected = msgChannel == "sms",
                            onClick = { msgChannel = "sms" },
                            label = { Text("رسالة SMS") }
                        )
                    }
                }
                OutlinedTextField(
                    value = msgRecipient,
                    onValueChange = { msgRecipient = it },
                    label = { Text("اسم الشخص (للبحث في جهات الاتصال)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = msgPhone,
                    onValueChange = { msgPhone = it },
                    label = { Text("رقم الموبايل (اختياري لو الاسم في جهات الاتصال)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = msgText,
                    onValueChange = { msgText = it },
                    label = { Text("نص الرسالة") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            if (isReminder) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedButton(
                        onClick = { showInlineTimePicker = true },
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(
                            Icons.Rounded.Schedule,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(ReminderScheduleCalculator.formatTimeArabic12(editedHour, editedMinute))
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            Icons.Rounded.Repeat,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = ReminderScheduleCalculator.formatRecurrenceLabelArabic(
                                editedRecurrence,
                                editedDays.sorted()
                            ),
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                }

                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(RECURRENCE_OPTIONS) { (code, label) ->
                        FilterChip(
                            selected = editedRecurrence == code,
                            onClick = { editedRecurrence = code },
                            label = { Text(label) }
                        )
                    }
                }

                if (editedRecurrence == ReminderScheduleCalculator.RECURRENCE_WEEKLY) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(ARABIC_WEEKDAYS) { (isoDay, label) ->
                            val active = isoDay in editedDays
                            FilterChip(
                                selected = active,
                                onClick = {
                                    editedDays = if (active) editedDays - isoDay else editedDays + isoDay
                                },
                                label = { Text(label) }
                            )
                        }
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = {
                        val finalTool = when {
                            isReminder -> tool.copy(
                                reminderTime = ReminderScheduleCalculator.formatTime24(
                                    editedHour,
                                    editedMinute
                                ),
                                recurrence = editedRecurrence,
                                daysOfWeek = editedDays.sorted()
                            )
                            isEmail -> tool.copy(
                                recipientEmail = emailTo.trim(),
                                subject = emailSubject.trim(),
                                body = emailBody.trim()
                            )
                            isNote -> tool.copy(
                                title = noteTitle.trim(),
                                content = noteContent.trim(),
                                openInPhoneNotes = noteExportExternal
                            )
                            isMessage -> tool.copy(
                                channel = msgChannel,
                                recipientName = msgRecipient.trim(),
                                phoneNumber = msgPhone.trim(),
                                messageText = msgText.trim()
                            )
                            else -> tool
                        }
                        onConfirm(finalTool)
                    },
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(confirmLabel)
                }
                OutlinedButton(onClick = onReject, shape = RoundedCornerShape(12.dp)) {
                    Text("إلغاء")
                }
            }
        }
    }

    if (showInlineTimePicker) {
        val pickerState = rememberTimePickerState(
            initialHour = editedHour,
            initialMinute = editedMinute,
            is24Hour = false
        )
        AlertDialog(
            onDismissRequest = { showInlineTimePicker = false },
            title = { Text("تعديل وقت التذكير") },
            text = {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    TimePicker(state = pickerState)
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        editedHour = pickerState.hour
                        editedMinute = pickerState.minute
                        showInlineTimePicker = false
                    }
                ) {
                    Text("حفظ الوقت")
                }
            },
            dismissButton = {
                TextButton(onClick = { showInlineTimePicker = false }) {
                    Text("إلغاء")
                }
            }
        )
    }
}
