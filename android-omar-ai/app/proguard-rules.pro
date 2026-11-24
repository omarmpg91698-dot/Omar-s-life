# Keep Kotlinx Serialization models
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.omarai.assistant.data.remote.**$$serializer { *; }
-keepclassmembers class com.omarai.assistant.data.remote.** {
    *** Companion;
}
-keepclasseswithmembers class com.omarai.assistant.data.remote.** {
    kotlinx.serialization.KSerializer serializer(...);
}
