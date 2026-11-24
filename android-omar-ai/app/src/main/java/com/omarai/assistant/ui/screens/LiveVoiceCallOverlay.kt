package com.omarai.assistant.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MicOff
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

private val CALL_MODES = listOf(
    "general" to "عام",
    "psychology" to "علم نفس",
    "marketing" to "تسويق",
    "egypt_shops" to "محلات مصر"
)

@Composable
fun LiveVoiceCallOverlay(
    userName: String,
    specialistMode: String,
    callState: String,
    isMuted: Boolean,
    rmsDb: Float,
    partialTranscript: String,
    lastUserText: String,
    lastReplyText: String,
    onSelectMode: (String) -> Unit,
    onOrbTap: () -> Unit,
    onToggleMute: () -> Unit,
    onEndCall: () -> Unit
) {
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            elapsedSeconds += 1
        }
    }

    val mins = (elapsedSeconds / 60).toString().padStart(2, '0')
    val secs = (elapsedSeconds % 60).toString().padStart(2, '0')

    val infinite = rememberInfiniteTransition(label = "live_call_orb")
    val basePulse by infinite.animateFloat(
        initialValue = 0.96f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(750),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )
    val dynamicScale = if (callState == "listening") {
        (1f + (rmsDb / 28f)).coerceIn(1f, 1.32f)
    } else if (callState == "speaking") {
        basePulse
    } else {
        1f
    }

    val orbColor = when (callState) {
        "listening" -> Color(0xFF14B8A6)
        "speaking" -> Color(0xFF10B981)
        "thinking" -> Color(0xFFF59E0B)
        else -> Color(0xFF334155)
    }

    val statusLabel = when (callState) {
        "listening" -> "سامعك دلوقتي... اتكلم بالمصري عادي"
        "thinking" -> "Omar's personal assistant بيفكّر في الرد..."
        "speaking" -> "Omar's personal assistant بيتكلم — اضغط الدائرة للمقاطعة"
        "muted" -> "الميكروفون مكتوم"
        else -> "اضغط على الدائرة عشان تتكلم"
    }

    Surface(
        color = Color(0xFF070B11),
        contentColor = Color.White,
        modifier = Modifier.fillMaxSize()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Header
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column {
                        Text(
                            text = "Omar's personal assistant · Live Call",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = "مكالمة صوتية حية بالمصري مع $userName",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF94A3B8)
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFF14B8A6).copy(alpha = 0.16f)
                    ) {
                        Text(
                            text = "$mins:$secs",
                            color = Color(0xFF5EEAD4),
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }
                }

                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp)
                ) {
                    items(CALL_MODES) { (code, label) ->
                        FilterChip(
                            selected = specialistMode == code,
                            onClick = { onSelectMode(code) },
                            label = { Text(label) }
                        )
                    }
                }
            }

            // Center Orb & Live Transcript
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(210.dp)) {
                    Box(
                        modifier = Modifier
                            .size(190.dp)
                            .scale(dynamicScale)
                            .clip(CircleShape)
                            .background(orbColor.copy(alpha = 0.18f))
                    )
                    FilledIconButton(
                        onClick = onOrbTap,
                        shape = CircleShape,
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = orbColor,
                            contentColor = Color(0xFF041114)
                        ),
                        modifier = Modifier.size(116.dp)
                    ) {
                        when (callState) {
                            "thinking" -> CircularProgressIndicator(
                                modifier = Modifier.size(40.dp),
                                strokeWidth = 3.dp,
                                color = Color(0xFF041114)
                            )
                            "speaking" -> Icon(
                                Icons.Rounded.VolumeUp,
                                contentDescription = "مقاطعة والحديث",
                                modifier = Modifier.size(46.dp)
                            )
                            "muted" -> Icon(
                                Icons.Rounded.MicOff,
                                contentDescription = "فتح الميكروفون",
                                modifier = Modifier.size(44.dp)
                            )
                            else -> Icon(
                                Icons.Rounded.Mic,
                                contentDescription = "التحدث الآن",
                                modifier = Modifier.size(46.dp)
                            )
                        }
                    }
                }

                Text(
                    text = statusLabel,
                    style = MaterialTheme.typography.titleSmall,
                    color = Color(0xFF5EEAD4),
                    textAlign = TextAlign.Center
                )

                val shownUser = partialTranscript.ifBlank { lastUserText }
                if (shownUser.isNotBlank()) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF111827),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                text = "أنت قلت:",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF94A3B8)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = shownUser,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                if (lastReplyText.isNotBlank()) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF0D2A2B),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                text = "Omar's personal assistant:",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF5EEAD4)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = lastReplyText,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White,
                                maxLines = 5,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            // Bottom Call Controls
            Row(
                horizontalArrangement = Arrangement.spacedBy(28.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                FilledIconButton(
                    onClick = onToggleMute,
                    shape = CircleShape,
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (isMuted) Color(0xFFF59E0B) else Color(0xFF1E293B),
                        contentColor = if (isMuted) Color(0xFF041114) else Color.White
                    ),
                    modifier = Modifier.size(60.dp)
                ) {
                    Icon(
                        imageVector = if (isMuted) Icons.Rounded.MicOff else Icons.Rounded.Mic,
                        contentDescription = if (isMuted) "فتح الميكروفون" else "كتم الميكروفون"
                    )
                }

                FilledIconButton(
                    onClick = onEndCall,
                    shape = CircleShape,
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = Color(0xFFE11D48),
                        contentColor = Color.White
                    ),
                    modifier = Modifier.size(68.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CallEnd,
                        contentDescription = "إنهاء المكالمة",
                        modifier = Modifier.size(30.dp)
                    )
                }
            }
        }
    }
}
