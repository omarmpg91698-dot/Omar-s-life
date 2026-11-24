package com.omarai.assistant.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class VoiceInputState(
    val isListening: Boolean = false,
    val partialText: String = "",
    val rmsDb: Float = 0f,
    val error: String? = null
)

class SpeechRecognizerManager(private val context: Context) {

    private var speechRecognizer: SpeechRecognizer? = null
    private var onFinalResultCallback: ((String) -> Unit)? = null

    private val _state = MutableStateFlow(VoiceInputState())
    val state: StateFlow<VoiceInputState> = _state.asStateFlow()

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun startListening(languageTag: String = "ar-EG", onFinalResult: (String) -> Unit) {
        if (!isAvailable()) {
            _state.value = VoiceInputState(
                error = "خدمة التعرف على الصوت غير متاحة على الجهاز ده."
            )
            return
        }

        stopListening()
        onFinalResultCallback = onFinalResult

        val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        speechRecognizer = recognizer

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                _state.value = VoiceInputState(isListening = true, partialText = "", error = null)
            }

            override fun onBeginningOfSpeech() = Unit

            override fun onRmsChanged(rmsdB: Float) {
                _state.value = _state.value.copy(rmsDb = rmsdB.coerceIn(0f, 12f))
            }

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                _state.value = _state.value.copy(isListening = false)
            }

            override fun onError(error: Int) {
                val friendly = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH -> "مسمعتش كلام واضح، جرّب تتكلم تاني."
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "انتهى وقت الاستماع، اضغط الميكروفون تاني."
                    SpeechRecognizer.ERROR_NETWORK,
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "تأكد من اتصال الإنترنت عشان التعرف على الصوت يشتغل."
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "محتاج إذن الميكروفون الأول."
                    else -> "حصلت مشكلة في الميكروفون، جرّب تاني."
                }
                _state.value = VoiceInputState(isListening = false, error = friendly)
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val finalTranscript = matches?.firstOrNull()?.trim().orEmpty()
                _state.value = VoiceInputState(isListening = false, partialText = "")
                if (finalTranscript.isNotEmpty()) {
                    onFinalResultCallback?.invoke(finalTranscript)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (partial.isNotEmpty()) {
                    _state.value = _state.value.copy(partialText = partial)
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        _state.value = VoiceInputState(isListening = true)
        recognizer.startListening(intent)
    }

    fun stopListening() {
        runCatching {
            speechRecognizer?.stopListening()
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
        }
        speechRecognizer = null
        _state.value = _state.value.copy(isListening = false, rmsDb = 0f)
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }
}
