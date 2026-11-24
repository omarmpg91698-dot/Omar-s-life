package com.omarai.assistant.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.omarai.assistant.ui.viewmodel.AssistantViewModel

private val EGYPT_AUDIENCE_OPTIONS = listOf(
    "شباب مصري (18–30 سنة)",
    "أسر وأمهات في مصر",
    "فئة A/B+ (تجمع / زايد / معادي)",
    "أصحاب بيزنس ومشاريع (B2B)"
)

private val AD_GOAL_OPTIONS = listOf(
    "مبيعات أونلاين مباشرة",
    "رسائل واتساب / إنبوكس",
    "حجز موعد أو استشارة",
    "زيادة التفاعل والوعي"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdAuditorScreen(
    viewModel: AssistantViewModel,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()

    var adCopy by remember { mutableStateOf("") }
    var targetAudience by remember { mutableStateOf(EGYPT_AUDIENCE_OPTIONS.first()) }
    var goal by remember { mutableStateOf(AD_GOAL_OPTIONS.first()) }

    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) viewModel.setAdAuditImage(uri)
    }

    fun copyToClipboard(text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("Omar's personal assistant Ad Copy", text))
        Toast.makeText(context, "تم نسخ النسخة الإعلانية", Toast.LENGTH_SHORT).show()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "رجوع")
                    }
                },
                title = {
                    Text(
                        text = "محلّل الإعلانات بالسيكولوجي",
                        fontWeight = FontWeight.Bold
                    )
                }
            )
        }
    ) { innerPadding ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            item {
                Text(
                    text = "ارفع سكرين شوت لإعلان أو صفحة بيع أو اكتب النص، و Omar's personal assistant هيقيّمه بدراسات علم النفس والتسويق ويكتبلك ٣ نسخ أقوى للسوق المصري.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            item {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (uiState.adAuditImageUri != null) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                AsyncImage(
                                    model = uiState.adAuditImageUri,
                                    contentDescription = "صورة الإعلان",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .size(72.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                )
                                Text(
                                    text = "تم إرفاق سكرين شوت الإعلان",
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f)
                                )
                                IconButton(onClick = { viewModel.clearAdAuditImage() }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "إزالة الصورة")
                                }
                            }
                        } else {
                            OutlinedButton(
                                onClick = {
                                    photoPicker.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                    )
                                },
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Rounded.Image, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("رفع سكرين شوت إعلان أو صفحة بيع")
                            }
                        }

                        OutlinedTextField(
                            value = adCopy,
                            onValueChange = { adCopy = it },
                            label = { Text("نص الإعلان أو العرض والسعر") },
                            placeholder = { Text("الصق نص الإعلان هنا...") },
                            minLines = 3,
                            maxLines = 6,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Text(
                            text = "الجمهور المستهدف في مصر",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(EGYPT_AUDIENCE_OPTIONS) { aud ->
                                FilterChip(
                                    selected = targetAudience == aud,
                                    onClick = { targetAudience = aud },
                                    label = { Text(aud) }
                                )
                            }
                        }

                        Text(
                            text = "هدف الإعلان",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(AD_GOAL_OPTIONS) { g ->
                                FilterChip(
                                    selected = goal == g,
                                    onClick = { goal = g },
                                    label = { Text(g) }
                                )
                            }
                        }

                        if (uiState.adAuditError != null) {
                            Text(
                                text = uiState.adAuditError!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }

                        Button(
                            onClick = {
                                viewModel.runAdPsychologyAudit(
                                    adCopy = adCopy,
                                    targetAudience = targetAudience,
                                    goal = goal
                                )
                            },
                            enabled = !uiState.adAuditLoading && (adCopy.isNotBlank() || uiState.adAuditImageUri != null),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (uiState.adAuditLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("بيحلل الإعلان بالسيكولوجي...")
                            } else {
                                Icon(Icons.Rounded.Campaign, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("حلّل الإعلان واكتب ٣ نسخ أقوى")
                            }
                        }
                    }
                }
            }

            val audit = uiState.adAuditResult
            if (audit != null) {
                item {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = audit.verdictTitleAr,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f)
                                )
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = MaterialTheme.colorScheme.primary
                                ) {
                                    Text(
                                        text = "${String.format("%.1f", audit.overallScore)} / 10",
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        fontWeight = FontWeight.ExtraBold,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                    )
                                }
                            }
                            Text(
                                text = audit.summaryAr,
                                style = MaterialTheme.typography.bodyMedium
                            )

                            val metrics = listOf(
                                "قوة الـ Hook" to audit.scores.hook,
                                "الإقناع النفسي" to audit.scores.persuasion,
                                "سيكولوجية السعر" to audit.scores.pricing,
                                "الوضوح والـ CTA" to audit.scores.clarityCta
                            )
                            metrics.forEach { (label, score) ->
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(label, style = MaterialTheme.typography.labelMedium)
                                        Text(
                                            "${String.format("%.1f", score)}/10",
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    LinearProgressIndicator(
                                        progress = { (score / 10.0).toFloat().coerceIn(0f, 1f) },
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(6.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                    )
                                }
                            }
                        }
                    }
                }

                if (audit.psychologyTriggers.isNotEmpty()) {
                    item {
                        Text(
                            text = "المحفزات النفسية والدراسات",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    items(audit.psychologyTriggers) { tr ->
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = tr.principleAr,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.weight(1f)
                                    )
                                    Text(
                                        text = when (tr.status) {
                                            "strong" -> "قوي"
                                            "missing" -> "ناقص"
                                            else -> "ضعيف"
                                        },
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                if (tr.studyRef.isNotBlank()) {
                                    Text(
                                        text = tr.studyRef,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Text(text = tr.noteAr, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }

                if (audit.rewrittenVariations.isNotEmpty()) {
                    item {
                        Text(
                            text = "٣ نسخ إعلانية أقوى للسوق المصري",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    items(audit.rewrittenVariations) { variation ->
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = variation.angleAr,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = variation.headlineAr,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = variation.bodyAr,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                if (variation.ctaAr.isNotBlank()) {
                                    Text(
                                        text = "CTA: ${variation.ctaAr}",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.padding(top = 6.dp)
                                ) {
                                    val fullCopy = listOf(
                                        variation.headlineAr,
                                        variation.bodyAr,
                                        variation.ctaAr
                                    ).filter { it.isNotBlank() }.joinToString("\n\n")
                                    Button(
                                        onClick = { copyToClipboard(fullCopy) },
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(
                                            Icons.Rounded.ContentCopy,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("نسخ النسخة")
                                    }
                                    IconButton(
                                        onClick = { viewModel.speakMessage(fullCopy, "ar-EG") }
                                    ) {
                                        Icon(
                                            Icons.Rounded.VolumeUp,
                                            contentDescription = "اسمعها بالمصري"
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
