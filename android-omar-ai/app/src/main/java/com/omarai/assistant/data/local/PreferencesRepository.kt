package com.omarai.assistant.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.omarai.assistant.BuildConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "omar_ai_prefs")

enum class ThemeMode { SYSTEM, LIGHT, DARK }

data class UserPreferences(
    val userName: String = "عمر",
    val themeMode: ThemeMode = ThemeMode.DARK,
    val voiceLanguage: String = "ar-EG", // "ar-EG" or "en-US"
    val autoSpeakReplies: Boolean = true,
    val backendBaseUrl: String = BuildConfig.DEFAULT_API_BASE_URL,
    val privateBioEncrypted: String = ""
)

class PreferencesRepository(private val context: Context) {

    private object Keys {
        val USER_NAME = stringPreferencesKey("user_name")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val VOICE_LANGUAGE = stringPreferencesKey("voice_language")
        val AUTO_SPEAK = booleanPreferencesKey("auto_speak_replies")
        val BACKEND_URL = stringPreferencesKey("backend_base_url")
    }

    private val encryptedPrefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "omar_ai_secure_vault",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    val preferencesFlow: Flow<UserPreferences> = context.dataStore.data.map { prefs ->
        val rawTheme = prefs[Keys.THEME_MODE] ?: ThemeMode.DARK.name
        val parsedTheme = runCatching { ThemeMode.valueOf(rawTheme) }.getOrDefault(ThemeMode.DARK)
        UserPreferences(
            userName = prefs[Keys.USER_NAME]?.takeIf { it.isNotBlank() } ?: "عمر",
            themeMode = parsedTheme,
            voiceLanguage = prefs[Keys.VOICE_LANGUAGE] ?: "ar-EG",
            autoSpeakReplies = prefs[Keys.AUTO_SPEAK] ?: true,
            backendBaseUrl = prefs[Keys.BACKEND_URL]?.takeIf { it.startsWith("https://") }
                ?: BuildConfig.DEFAULT_API_BASE_URL,
            privateBioEncrypted = encryptedPrefs.getString(KEY_PRIVATE_BIO, "") ?: ""
        )
    }

    suspend fun updateUserName(name: String) {
        val clean = name.trim().take(40)
        if (clean.isEmpty()) return
        context.dataStore.edit { it[Keys.USER_NAME] = clean }
    }

    suspend fun updateThemeMode(mode: ThemeMode) {
        context.dataStore.edit { it[Keys.THEME_MODE] = mode.name }
    }

    suspend fun updateVoiceLanguage(lang: String) {
        val safe = if (lang == "en-US") "en-US" else "ar-EG"
        context.dataStore.edit { it[Keys.VOICE_LANGUAGE] = safe }
    }

    suspend fun updateAutoSpeak(enabled: Boolean) {
        context.dataStore.edit { it[Keys.AUTO_SPEAK] = enabled }
    }

    suspend fun updateBackendUrl(url: String) {
        val trimmed = url.trim().trimEnd('/')
        if (!trimmed.startsWith("https://")) return
        context.dataStore.edit { it[Keys.BACKEND_URL] = trimmed }
    }

    suspend fun updateEncryptedPrivateBio(bio: String) {
        encryptedPrefs.edit().putString(KEY_PRIVATE_BIO, bio.trim().take(1200)).apply()
        // Touch DataStore so collectors emit updated snapshot
        context.dataStore.edit { prefs ->
            prefs[Keys.USER_NAME] = prefs[Keys.USER_NAME] ?: "عمر"
        }
    }

    fun clearEncryptedVault() {
        encryptedPrefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_PRIVATE_BIO = "encrypted_personal_bio"
    }
}
