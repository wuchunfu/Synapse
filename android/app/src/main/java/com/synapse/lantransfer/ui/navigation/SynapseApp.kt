package com.synapse.lantransfer.ui.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.synapse.lantransfer.data.model.TransferState
import com.synapse.lantransfer.data.service.TransferManager
import com.synapse.lantransfer.ui.components.AnimatedBackground
import com.synapse.lantransfer.ui.components.TransferOverlay
import com.synapse.lantransfer.ui.screens.*
import com.synapse.lantransfer.util.formatBytes
import com.synapse.lantransfer.util.formatSpeed

@Composable
fun SynapseApp() {
    var showSplash by remember { mutableStateOf(true) }

    AnimatedContent(
        targetState = showSplash,
        transitionSpec = {
            fadeIn(animationSpec = tween(800)) togetherWith fadeOut(animationSpec = tween(800))
        },
        label = "splashTransition"
    ) { splash ->
        if (splash) {
            SplashScreen(onFinished = { showSplash = false })
        } else {
            MainAppContent()
        }
    }
}

@Composable
fun MainAppContent() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val transferManager = remember { TransferManager(context) }
    val transferState by transferManager.transferState.collectAsState()

    val showOverlay = when (val state = transferState) {
        is TransferState.Sending -> state.progress != null
        is TransferState.Receiving -> state.progress != null
        else -> false
    }

    val progress = when (val state = transferState) {
        is TransferState.Sending -> state.progress
        is TransferState.Receiving -> state.progress
        else -> null
    }

    DisposableEffect(Unit) {
        onDispose {
            transferManager.destroy()
        }
    }

    Scaffold(
        bottomBar = {
            SynapseBottomBar(navController = navController)
        },
        modifier = Modifier.fillMaxSize(),
        containerColor = androidx.compose.ui.graphics.Color.Transparent
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            AnimatedBackground()

            NavHost(
                navController = navController,
                startDestination = Screen.Send.route,
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(300)) }
            ) {
                composable(Screen.Send.route) {
                    SendScreen(transferManager = transferManager)
                }
                composable(Screen.Receive.route) {
                    ReceiveScreen(transferManager = transferManager)
                }
                composable(Screen.History.route) {
                    HistoryScreen()
                }
                composable(Screen.Settings.route) {
                    SettingsScreen()
                }
            }

            if (showOverlay && progress != null) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.BottomCenter
                ) {
                    TransferOverlay(
                        fileName = progress.fileName,
                        progress = progress.fraction,
                        transferredBytes = formatBytes(progress.bytesTransferred),
                        totalBytes = formatBytes(progress.totalBytes),
                        speed = formatSpeed(progress.speed),
                        isVisible = true,
                        onCancel = {
                            when (transferState) {
                                is TransferState.Sending -> transferManager.stopSending()
                                is TransferState.Receiving -> transferManager.cancelReceive()
                                else -> {}
                            }
                        },
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }
            }
        }
    }
}
