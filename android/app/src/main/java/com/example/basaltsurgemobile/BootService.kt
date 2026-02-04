package com.example.basaltsurgemobile

import android.app.Service
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * BootService - Foreground service that launches MainActivity on boot.
 * 
 * On Android 10+, starting activities directly from a BroadcastReceiver
 * is restricted. Using a ForegroundService is the reliable workaround
 * for kiosk/terminal applications that need to auto-start.
 */
class BootService : Service() {
    
    companion object {
        private const val TAG = "BootService"
        private const val CHANNEL_ID = "boot_service_channel"
        private const val NOTIFICATION_ID = 1001
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "BootService created")
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "BootService onStartCommand")
        
        // Start as foreground service immediately to avoid being killed
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)
        
        // Launch MainActivity
        launchMainActivity()
        
        // Stop the service after launching (we don't need it running)
        stopSelf()
        
        return START_NOT_STICKY
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Auto-Start Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Used for auto-starting the app on boot"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created")
        }
    }
    
    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Starting...")
            .setContentText("Launching payment terminal")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()
    }
    
    private fun launchMainActivity() {
        try {
            Log.d(TAG, "Launching MainActivity...")
            
            val launchIntent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            
            startActivity(launchIntent)
            Log.d(TAG, "MainActivity launch intent sent successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity: ${e.message}", e)
        }
    }
}
