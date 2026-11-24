package com.omarai.assistant.data.remote

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

interface OmarAiApiService {
    @POST("api/omar-ai/chat")
    suspend fun sendChat(@Body request: OmarAiChatRequest): Response<OmarAiChatResponse>

    @POST("api/omar-ai/tts")
    suspend fun synthesizeSpeech(@Body request: TtsRequest): Response<TtsResponse>

    @POST("api/omar-ai/audit-ad")
    suspend fun auditAd(@Body request: AdAuditRequest): Response<AdPsychologyAuditResponse>
}

object ApiClientFactory {
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    fun create(baseUrl: String): OmarAiApiService {
        val normalized = baseUrl.trim().trimEnd('/') + "/"
        val okHttp = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(normalized)
            .client(okHttp)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(OmarAiApiService::class.java)
    }
}
