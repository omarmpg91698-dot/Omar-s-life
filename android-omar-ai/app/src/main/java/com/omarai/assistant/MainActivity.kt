package com.omarai.assistant

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel
import com.omarai.assistant.data.local.ThemeMode
import com.omarai.assistant.ui.navigation.OmarAiNavHost
import com.omarai.assistant.ui.theme.OmarAiTheme
import com.omarai.assistant.ui.viewmodel.AssistantViewModel
import com.omarai.assistant.ui.viewmodel.AssistantViewModelFactory

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val appContainer = (application as OmarAiApplication).container

        setContent {
            val viewModel: AssistantViewModel = viewModel(
                factory = AssistantViewModelFactory(application, appContainer)
            )
            val prefs by viewModel.preferences.collectAsState()

            val darkTheme = when (prefs.themeMode) {
                ThemeMode.DARK -> true
                ThemeMode.LIGHT -> false
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
            }

            val layoutDirection = if (prefs.voiceLanguage.startsWith("ar")) {
                LayoutDirection.Rtl
            } else {
                LayoutDirection.Ltr
            }

            OmarAiTheme(darkTheme = darkTheme) {
                CompositionLocalProvider(LocalLayoutDirection provides layoutDirection) {
                    OmarAiNavHost(viewModel = viewModel)
                }
            }
        }
    }
}
