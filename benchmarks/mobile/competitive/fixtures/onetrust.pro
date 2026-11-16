# OneTrust official Android installation guide, Gradle8+/R8 Solution2.
# QR/advertising identifier are optional and unused by this host.
-dontwarn com.google.zxing.**
-dontwarn com.google.android.gms.ads.identifier.AdvertisingIdClient$Info
-dontwarn com.google.android.gms.ads.identifier.AdvertisingIdClient
# Same guide, Retrofit full-mode Option1.
-if interface * { @retrofit2.http.* public *** *(...); }
-keep,allowoptimization,allowshrinking,allowobfuscation class <3>
