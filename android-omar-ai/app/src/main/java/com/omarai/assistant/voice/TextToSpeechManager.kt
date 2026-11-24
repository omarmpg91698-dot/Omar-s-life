package com.omarai.assistant.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import com.omarai.assistant.data.remote.ApiClientFactory
import com.omarai.assistant.data.remote.TtsRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale
import java.util.UUID

class TextToSpeechManager(context: Context) : TextToSpeech.OnInitListener {

    private val appContext = context.applicationContext
    private var tts: TextToSpeech? = TextToSpeech(appContext, this)
    private var mediaPlayer: MediaPlayer? = null
    private var activeTempAudio: File? = null
    private var neuralJob: Job? = null
    private var pendingOnComplete: (() -> Unit)? = null
    private var isReady = false

    private val _isSpeaking = MutableStateFlow(false)
    val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()

    override fun onInit(status: Int) {
        isReady = status == TextToSpeech.SUCCESS
        if (isReady) {
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    _isSpeaking.value = true
                }

                override fun onDone(utteranceId: String?) {
                    _isSpeaking.value = false
                    val cb = pendingOnComplete
                    pendingOnComplete = null
                    cb?.invoke()
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    _isSpeaking.value = false
                    val cb = pendingOnComplete
                    pendingOnComplete = null
                    cb?.invoke()
                }

                override fun onError(utteranceId: String?, errorCode: Int) {
                    _isSpeaking.value = false
                    val cb = pendingOnComplete
                    pendingOnComplete = null
                    cb?.invoke()
                }
            })
        }
    }

    /**
     * Synthesizes natural Egyptian Arabic speech via the secure backend (/api/omar-ai/tts)
     * and plays the WAV clip directly via MediaPlayer, with instant fallback to local Android TTS.
     */
    fun speakNaturalEgyptian(
        text: String,
        preferredLang: String,
        backendBaseUrl: String,
        scope: CoroutineScope,
        onComplete: (() -> Unit)? = null
    ) {
        val clean = text.trim()
        if (clean.isEmpty()) {
            onComplete?.invoke()
            return
        }

        stop()
        pendingOnComplete = onComplete
        _isSpeaking.value = true

        neuralJob = scope.launch {
            val wavBytes = withContext(Dispatchers.IO) {
                runCatching {
                    val api = ApiClientFactory.create(backendBaseUrl)
                    val response = api.synthesizeSpeech(
                        TtsRequest(text = clean.take(650), language = preferredLang)
                    )
                    if (response.isSuccessful) {
                        val b64 = response.body()?.audioBase64.orEmpty()
                        if (b64.isNotBlank()) Base64.decode(b64, Base64.DEFAULT) else null
                    } else {
                        null
                    }
                }.getOrNull()
            }

            if (wavBytes != null && wavBytes.isNotEmpty()) {
                val played = withContext(Dispatchers.Main) { playWavBytes(wavBytes) }
                if (played) return@launch
            }

            withContext(Dispatchers.Main) {
                speakLocalOffline(clean, preferredLang)
            }
        }
    }

    private fun playWavBytes(bytes: ByteArray): Boolean {
        return runCatching {
            val tempFile = File.createTempFile("omar_ai_tts_", ".wav", appContext.cacheDir)
            tempFile.writeBytes(bytes)
            activeTempAudio = tempFile

            val player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .build()
                )
                setDataSource(tempFile.absolutePath)
                setOnCompletionListener {
                    releasePlayer()
                    _isSpeaking.value = false
                    val cb = pendingOnComplete
                    pendingOnComplete = null
                    cb?.invoke()
                }
                setOnErrorListener { _, _, _ ->
                    releasePlayer()
                    _isSpeaking.value = false
                    val cb = pendingOnComplete
                    pendingOnComplete = null
                    cb?.invoke()
                    true
                }
                prepare()
                start()
            }
            mediaPlayer = player
            _isSpeaking.value = true
            true
        }.getOrElse {
            releasePlayer()
            false
        }
    }

    fun speak(text: String, preferredLang: String = "ar-EG", onComplete: (() -> Unit)? = null) {
        stop()
        pendingOnComplete = onComplete
        speakLocalOffline(text, preferredLang)
    }

    private fun speakLocalOffline(text: String, preferredLang: String) {
        val clean = text.trim()
        if (!isReady || clean.isEmpty()) {
            _isSpeaking.value = false
            val cb = pendingOnComplete
            pendingOnComplete = null
            cb?.invoke()
            return
        }

        val hasArabic = clean.any { it in '\u0600'..'\u06FF' }
        val targetLocale = when {
            hasArabic || preferredLang.startsWith("ar") -> {
                val egypt = Locale("ar", "EG")
                val avail = tts?.isLanguageAvailable(egypt) ?: TextToSpeech.LANG_NOT_SUPPORTED
                if (avail >= TextToSpeech.LANG_AVAILABLE) egypt else Locale("ar")
            }
            else -> Locale.US
        }

        tts?.language = targetLocale
        tts?.setSpeechRate(1.02f)
        tts?.speak(clean, TextToSpeech.QUEUE_FLUSH, null, UUID.randomUUID().toString())
    }

    private fun releasePlayer() {
        runCatching {
            mediaPlayer?.stop()
        }
        runCatching {
            mediaPlayer?.release()
        }
        mediaPlayer = null
        runCatching { activeTempAudio?.delete() }
        activeTempAudio = null
    }

    fun stop() {
        pendingOnComplete = null
        neuralJob?.cancel()
        neuralJob = null
        releasePlayer()
        runCatching { tts?.stop() }
        _isSpeaking.value = false
    }

    fun shutdown() {
        stop()
        runCatching { tts?.shutdown() }
        tts = null
        isReady = false
    }
}
