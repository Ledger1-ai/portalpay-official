package com.example.basaltsurgemobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.example.basaltsurgemobile.ui.theme.BasaltSurgeMobileTheme
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView

class MainActivity : ComponentActivity() {
    private var runtime: GeckoRuntime? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        runtime = GeckoRuntime.create(this)
        val session = GeckoSession()
        session.open(runtime!!)
        //session.loadUri("https://xoinpay.azurewebsites.net/touchpoint/setup")
        // Use BASE_DOMAIN from BuildConfig and append the setup path
        val setupUrl = "${BuildConfig.BASE_DOMAIN}/touchpoint/setup?scale=0.75"
        session.loadUri(setupUrl)

        enableEdgeToEdge()
        setContent {
            BasaltSurgeMobileTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    GeckoViewContainer(
                        session = session,
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }
}

@Composable
fun GeckoViewContainer(session: GeckoSession, modifier: Modifier = Modifier) {
    AndroidView(
        factory = { context ->
            GeckoView(context).apply {
                setSession(session)
            }
        },
        modifier = modifier.fillMaxSize()
    )
}
