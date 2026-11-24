package com.omarai.assistant.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class ChatHistoryItemDto(
    val role: String,
    val text: String
)

@Serializable
data class MemorySnapshotDto(
    val category: String,
    val fact: String
)

@Serializable
data class TaskSnapshotDto(
    val id: String,
    val title: String,
    val dueDateIso: String? = null,
    val completed: Boolean = false
)

@Serializable
data class OmarAiChatRequest(
    val message: String,
    val specialistMode: String = "general",
    val imageDataUrl: String? = null,
    val attachedDocName: String? = null,
    val attachedDocText: String? = null,
    val history: List<ChatHistoryItemDto> = emptyList(),
    val memories: List<MemorySnapshotDto> = emptyList(),
    val tasks: List<TaskSnapshotDto> = emptyList(),
    val userName: String = "عمر",
    val personalBio: String = "",
    val preferredLanguage: String = "ar-EG",
    val deviceTimeIso: String,
    val deviceTimeZone: String
)

@Serializable
data class GroundingSourceDto(
    val title: String,
    val uri: String,
    val kind: String = "web"
)

@Serializable
data class EgyptShopDto(
    val id: String,
    val name: String,
    val address: String,
    val primaryType: String? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    val openNow: Boolean? = null,
    val phone: String? = null,
    val googleMapsUri: String? = null
)

@Serializable
data class ToolCallDto(
    val type: String,
    val requiresConfirmation: Boolean = true,
    val confirmationPrompt: String = "",
    val appName: String? = null,
    val phoneNumber: String? = null,
    val url: String? = null,
    val title: String? = null,
    val description: String? = null,
    val startTimeIso: String? = null,
    val delayMinutes: Int? = null,
    val reminderTime: String? = null, // "HH:MM" 24-hour precise time
    val recurrence: String? = null, // "once", "daily", "weekly", "monthly"
    val daysOfWeek: List<Int>? = null, // ISO 1=Mon..7=Sun
    val taskId: String? = null,
    val dueDateIso: String? = null,
    val shareText: String? = null,
    val memoryCategory: String? = null,
    val memoryFact: String? = null,
    val isSensitiveMemory: Boolean = false,
    // Email template, phone notes, and WhatsApp/SMS messaging
    val recipientEmail: String? = null,
    val recipientName: String? = null,
    val subject: String? = null,
    val body: String? = null,
    val content: String? = null,
    val noteCategory: String? = null,
    val openInPhoneNotes: Boolean = false,
    val channel: String? = null, // "whatsapp" or "sms"
    val messageText: String? = null
)

@Serializable
data class OmarAiChatResponse(
    val reply: String,
    val language: String = "ar-EG",
    val resolvedMode: String = "general",
    val suggestedFollowUps: List<String> = emptyList(),
    val toolCalls: List<ToolCallDto> = emptyList(),
    val sources: List<GroundingSourceDto> = emptyList(),
    val places: List<EgyptShopDto> = emptyList()
)

@Serializable
data class TtsRequest(
    val text: String,
    val language: String = "ar-EG"
)

@Serializable
data class TtsResponse(
    val audioBase64: String,
    val mimeType: String = "audio/wav",
    val voiceName: String = "Orus"
)

@Serializable
data class AdAuditRequest(
    val adCopy: String = "",
    val imageDataUrl: String? = null,
    val targetAudience: String = "الجمهور المصري",
    val goal: String = "مبيعات أونلاين مباشرة"
)

@Serializable
data class AdAuditScoresDto(
    val hook: Double = 5.0,
    val persuasion: Double = 5.0,
    val pricing: Double = 5.0,
    val clarityCta: Double = 5.0
)

@Serializable
data class AdPsychologyTriggerDto(
    val principleAr: String,
    val studyRef: String = "",
    val status: String = "weak",
    val noteAr: String = ""
)

@Serializable
data class AdRewrittenVariationDto(
    val angleAr: String,
    val headlineAr: String,
    val bodyAr: String,
    val ctaAr: String = ""
)

@Serializable
data class AdPsychologyAuditResponse(
    val overallScore: Double = 5.0,
    val verdictTitleAr: String = "",
    val summaryAr: String = "",
    val scores: AdAuditScoresDto = AdAuditScoresDto(),
    val psychologyTriggers: List<AdPsychologyTriggerDto> = emptyList(),
    val weaknessesAr: List<String> = emptyList(),
    val rewrittenVariations: List<AdRewrittenVariationDto> = emptyList()
)

@Serializable
data class ApiErrorResponse(
    val error: String? = null,
    val message: String? = null
)
