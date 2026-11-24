package com.omarai.assistant.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.omarai.assistant.data.local.ThemeMode
import com.omarai.assistant.ui.viewmodel.AssistantViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: AssistantViewModel,
    onBack: () -> Unit
) {
    val prefs by viewModel.preferences.collectAsState()
    var nameDraft by remember(prefs.userName) { mutableStateOf(prefs.userName) }
    var serverDraft by remember(prefs.backendBaseUrl) { mutableStateOf(prefs.backendBaseUrl) }
    var confirmWipe by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("الإعدادات والخصوصية") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "رجوع")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                SettingsCard(title = "الاسم والمظهر") {
                    OutlinedTextField(
                        value = nameDraft,
                        onValueChange = { nameDraft = it },
                        label = { Text("يناديك بإيه؟") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = { viewModel.updateUserName(nameDraft) },
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("حفظ الاسم")
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(
                            ThemeMode.DARK to "داكن",
                            ThemeMode.LIGHT to "فاتح",
                            ThemeMode.SYSTEM to "النظام"
                        ).forEach { (mode, label) ->
                            FilterChip(
                                selected = prefs.themeMode == mode,
                                onClick = { viewModel.updateThemeMode(mode) },
                                label = { Text(label) }
                            )
                        }
                    }
                }
            }

            item {
                SettingsCard(title = "الصوت واللغة") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = prefs.voiceLanguage == "ar-EG",
                            onClick = { viewModel.updateVoiceLanguage("ar-EG") },
                            label = { Text("مصري (عربي)") }
                        )
                        FilterChip(
                            selected = prefs.voiceLanguage == "en-US",
                            onClick = { viewModel.updateVoiceLanguage("en-US") },
                            label = { Text("English") }
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("قراءة الردود تلقائياً بالصوت", style = MaterialTheme.typography.bodyMedium)
                        Switch(
                            checked = prefs.autoSpeakReplies,
                            onCheckedChange = { viewModel.updateAutoSpeak(it) }
                        )
                    }
                }
            }

            item {
                SettingsCard(title = "اتصال الخادم الآمن (بدون مفاتيح داخل APK)") {
                    OutlinedTextField(
                        value = serverDraft,
                        onValueChange = { serverDraft = it },
                        label = { Text("رابط الخادم (HTTPS)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = { viewModel.updateBackendUrl(serverDraft) },
                        enabled = serverDraft.trim().startsWith("https://"),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("تحديث رابط الخادم")
                    }
                }
            }

            item {
                SettingsCard(title = "الخصوصية وإدارة البيانات") {
                    Text(
                        text = "كل المحادثات والذكريات بتتحفظ محلياً على موبايلك فقط. الميكروفون والكاميرا والملفات بيتطلبوا إذنك المباشر وقت الاستخدام فقط.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedButton(
                        onClick = { viewModel.clearAllConversations() },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("مسح سجل المحادثات فقط")
                    }
                    Button(
                        onClick = { confirmWipe = true },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("مسح كل البيانات والذكريات")
                    }
                }
            }
        }
    }

    if (confirmWipe) {
        AlertDialog(
            onDismissRequest = { confirmWipe = false },
            title = { Text("تأكيد مسح البيانات") },
            text = { Text("هيتم مسح كل المحادثات والذكريات والمهام المحلية نهائياً. متأكد؟") },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.wipeAllLocalData()
                        confirmWipe = false
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("امسح الكل")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmWipe = false }) {
                    Text("إلغاء")
                }
            }
        )
    }
}

@Composable
private fun SettingsCard(
    title: String,
    content: @Composable () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}
