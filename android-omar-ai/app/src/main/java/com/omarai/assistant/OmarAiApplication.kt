package com.omarai.assistant

import android.app.Application
import com.omarai.assistant.data.local.OmarAiDatabase
import com.omarai.assistant.data.local.PreferencesRepository
import com.omarai.assistant.tools.AndroidPhoneTools
import com.omarai.assistant.tools.ReminderAlarmScheduler
import com.omarai.assistant.tools.ReminderWorker
import com.omarai.assistant.voice.SpeechRecognizerManager
import com.omarai.assistant.voice.TextToSpeechManager

class AppContainer(application: Application) {
    val database: OmarAiDatabase = OmarAiDatabase.getInstance(application)
    val preferencesRepository: PreferencesRepository = PreferencesRepository(application)
    val speechRecognizerManager: SpeechRecognizerManager = SpeechRecognizerManager(application)
    val textToSpeechManager: TextToSpeechManager = TextToSpeechManager(application)
    val reminderAlarmScheduler: ReminderAlarmScheduler = ReminderAlarmScheduler(application)
    val phoneTools: AndroidPhoneTools = AndroidPhoneTools(
        context = application,
        memoryDao = database.memoryDao(),
        taskDao = database.taskDao(),
        reminderDao = database.reminderDao(),
        noteDao = database.noteDao(),
        reminderAlarmScheduler = reminderAlarmScheduler
    )
}

class OmarAiApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        ReminderWorker.ensureChannel(this)
        container = AppContainer(this)
    }

    override fun onTerminate() {
        super.onTerminate()
        container.speechRecognizerManager.stopListening()
        container.textToSpeechManager.shutdown()
    }
}
