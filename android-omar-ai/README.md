# Omar's personal assistant — Native Android Personal Assistant (Kotlin + Jetpack Compose)

A real, modular native Android application inspired by Meta Muse, tailored for Egyptian Arabic (`ar-EG`) and English (`en-US`), built for Android 8.0+ (optimized for Samsung Galaxy S23 Ultra / Android 14 & 15).

## Architecture Overview
- **UI**: Jetpack Compose + Material 3 (Dark & Light themes, automatic RTL Arabic / LTR English layout direction).
- **Architecture**: Clean MVVM (`AssistantViewModel` + `AppContainer`).
- **Local Storage & Privacy**:
  - **Room Database** (`OmarAiDatabase` v3): Conversations, Messages, Personal Memories, Local Tasks, Phone Notes (`NoteEntity`), and Scheduled Recurring Reminders (`ReminderEntity`).
  - **DataStore Preferences**: Theme, voice language, auto-speak toggle, and backend server URL.
  - **Android Keystore (`EncryptedSharedPreferences` AES256-GCM)**: Encrypted personal bio vault.
- **Egyptian Arabic Neural Voice Engine & Hands-Free Live Voice Call Mode (`LiveVoiceCallOverlay.kt`)**:
  - Full-screen hands-free Egyptian Arabic Voice Call mode with live RMS audio orb, live subtitles, instant tap-to-interrupt barge-in, mute control, and automatic listen-after-speak continuity.
  - Native `android.speech.SpeechRecognizer` (`ar-EG` & `en-US` with partial live transcription).
  - Gemini Neural Egyptian Arabic TTS (`POST /api/omar-ai/tts`, WAV playback via `MediaPlayer`) with automatic offline fallback to native Android `TextToSpeech` and instant interrupt on tap.
- **Ad & Copy Psychology Auditor (`AdAuditorScreen.kt`)**:
  - Upload an ad/landing page screenshot or paste ad copy to receive a `/10` behavioral psychology score, 4 sub-scores (Hook, Persuasion, Pricing Psychology, Clarity & CTA), triggered scientific principles, conversion weaknesses for Egypt, and 3 one-tap copyable Egyptian Arabic ad rewrites (`POST /api/omar-ai/audit-ad`).
- **Psychology Studies, Marketing Research & Real Egypt Shops**:
  - Built-in specialist modes (`مساعد عام`, `علم النفس`, `التسويق`, `محلات مصر`) powered by curated psychology/marketing studies, live **Google Search Grounding** with clickable verified citations, and real **Google Maps Platform Places API (New)** / Maps Grounding shop cards for Egypt.
- **Camera, Vision & Documents**:
  - `FileProvider` + `TakePicture` camera capture, Android Photo Picker gallery upload, JPEG compression, and `OpenDocument` text file summarization.
- **Native Android Phone Tools, Email Templates, Phone Notes, WhatsApp/SMS & Recurring Alarms (`AndroidPhoneTools.kt`, `NotesScreen.kt`, `ReminderAlarmScheduler.kt`)**:
  - **Email Template Composer (`compose_email`)**: Reviews & edits To/Subject/Body inline, then launches Gmail/Email client pre-filled (`ACTION_SENDTO` `mailto:`).
  - **Phone Notes (`create_note` + `NotesScreen.kt`)**: Saves notes locally in Room (`NoteEntity`) and exports directly to **Samsung Notes / Google Keep** via official Android Note (`CREATE_NOTE`) and Share Intents.
  - **WhatsApp & SMS Messaging (`send_message`)**: Looks up recipient numbers from Android Contacts after explicit `READ_CONTACTS` permission, normalizes Egyptian numbers (`01x` -> `201x`), and opens **WhatsApp** or **Samsung Messages (SMS)** pre-filled for final confirmation tap.
  - Schedule exact one-time or recurring reminders (`once`, `daily`, `weekly` on selected weekdays, `monthly`) using native Android `AlarmManager` (`setExactAndAllowWhileIdle` with safe fallback), high-priority notification channel, automatic rescheduling after device reboot (`BOOT_COMPLETED`), and an inline Material 3 `TimePicker` inside the chat composer and tool confirmation cards.
  - Open installed apps (`PackageManager`), open system dialer (`ACTION_DIAL`), open validated HTTPS/HTTP URLs (`ACTION_VIEW`), create calendar events (`CalendarContract` with user confirmation), share via Android Share Sheet, manage tasks and user-approved personal memories.
- **API Key Security**:
  - Zero private Gemini or Google Maps API keys are stored inside the APK. The app communicates over HTTPS with the secure backend endpoints (`POST /api/omar-ai/chat`, `POST /api/omar-ai/tts`, `POST /api/omar-ai/audit-ad`).

## How to Build the Debug APK for Samsung S23 Ultra

1. **Install Android Studio** (Ladybug 2024.2 or newer, with JDK 17 bundled).
2. **Open Project**: Unzip `OmarAI-AndroidStudio-Project.zip` and choose **File → Open** → select the `android-omar-ai` folder.
3. **Sync Gradle**: Wait for Android Studio to download dependencies automatically.
4. *(Optional)* Customize your backend URL in `local.properties`:
   ```properties
   OMAR_AI_BASE_URL=https://ais-pre-2z4p2xzbczx7hybzgtiand-179633386561.europe-west2.run.app
   ```
5. **Install Directly on Samsung S23 Ultra**:
   - Enable **Developer Options → USB Debugging** on your S23 Ultra.
   - Connect via USB-C and click **Run ▶** in Android Studio.
6. **Build a Shareable Debug APK**:
   - In Android Studio menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
   - Or from terminal inside `android-omar-ai`:
     ```bash
     ./gradlew assembleDebug
     ```
   - APK output path: `app/build/outputs/apk/debug/app-debug.apk`.

## How to Build a Signed Release APK

1. In Android Studio: **Build → Generate Signed App Bundle or APK → APK**.
2. Create a new Keystore (`.jks`) and keep its password safe.
3. Choose the **release** build variant (ProGuard/R8 shrinking and resource optimization are already configured in `app/build.gradle.kts` and `app/proguard-rules.pro`).
4. Install `app/release/app-release.apk` on your device.
