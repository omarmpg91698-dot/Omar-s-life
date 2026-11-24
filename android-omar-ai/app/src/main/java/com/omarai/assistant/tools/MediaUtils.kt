package com.omarai.assistant.tools

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.max

object MediaUtils {

    fun createCameraImageUri(context: Context): Uri {
        val cameraDir = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(cameraDir, "omar_ai_${System.currentTimeMillis()}.jpg")
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
    }

    fun compressImageUriToDataUrl(context: Context, uri: Uri, maxSidePx: Int = 1080): String? {
        return runCatching {
            val resolver = context.contentResolver
            val original = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
                ?: return null

            val longest = max(original.width, original.height)
            val scaled = if (longest > maxSidePx) {
                val ratio = maxSidePx.toFloat() / longest.toFloat()
                Bitmap.createScaledBitmap(
                    original,
                    (original.width * ratio).toInt().coerceAtLeast(1),
                    (original.height * ratio).toInt().coerceAtLeast(1),
                    true
                )
            } else {
                original
            }

            val output = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 82, output)
            if (scaled !== original) {
                scaled.recycle()
            }
            original.recycle()

            val base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
            "data:image/jpeg;base64,$base64"
        }.getOrNull()
    }

    fun readSelectedTextDocument(context: Context, uri: Uri, maxChars: Int = 12_000): Pair<String, String>? {
        return runCatching {
            val resolver = context.contentResolver
            var displayName = "document.txt"
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIdx >= 0) {
                        displayName = cursor.getString(nameIdx) ?: displayName
                    }
                }
            }
            val text = resolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { reader ->
                reader.readText().take(maxChars)
            } ?: return null
            displayName to text
        }.getOrNull()
    }
}
