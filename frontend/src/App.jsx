import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X, Monitor } from 'lucide-react'
import { ToastProvider } from './hooks/useToast'
import Toast from './components/Toast'
import Sidebar from './components/Sidebar'
import TransferOverlay from './components/TransferOverlay'
import SendTab from './tabs/SendTab'
import ReceiveTab from './tabs/ReceiveTab'
import HistoryTab from './tabs/HistoryTab'
import SettingsTab from './tabs/SettingsTab'
import styles from './App.module.css'
import overlayStyles from './components/TransferOverlay.module.css'

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, size = Number(bytes)
  while (size >= 1000 && i < units.length - 1) { size /= 1000; i++ }
  return `${size.toFixed(1)} ${units[i]}`
}

const TAB_ORDER = ['send', 'receive', 'history', 'settings']

function AppInner() {
  const [activeTab,    setActiveTab]    = useState('send')
  const [prevTab,      setPrevTab]      = useState(null)
  const [deviceInfo,   setDeviceInfo]   = useState(null)
  const [isSending,    setIsSending]    = useState(false)
  const [senderPort,   setSenderPort]   = useState(null)
  const [transfer,     setTransfer]     = useState({ visible: false })
  const [connRequest,  setConnRequest]  = useState({ visible: false, addr: '' })
  const speedRef = useRef({ time: 0, bytes: 0, text: '— B/s' })

  // Load device info
  useEffect(() => {
    (async () => {
      try {
        const info = await window.go?.gui?.App?.GetDeviceInfo?.()
        if (info) setDeviceInfo(info)
      } catch (e) { console.warn('Device info unavailable:', e) }
    })()
  }, [])

  // Wails events
  useEffect(() => {
    if (!window.runtime) return

    const offs = [
      window.runtime.EventsOn('sender:started', port => {
        setSenderPort(port)
        setIsSending(true)
      }),
      window.runtime.EventsOn('sender:stopped', () => {
        setIsSending(false)
        setSenderPort(null)
      }),
      window.runtime.EventsOn('sender:error', () => {
        setIsSending(false)
      }),
      window.runtime.EventsOn('connection:request', addr => {
        setConnRequest({ visible: true, addr })
      }),
      window.runtime.EventsOn('connection:accepted', () => {
        setConnRequest({ visible: false, addr: '' })
      }),
      window.runtime.EventsOn('connection:rejected', () => {
        setConnRequest({ visible: false, addr: '' })
      }),
      window.runtime.EventsOn('connection:timeout', () => {
        setConnRequest({ visible: false, addr: '' })
      }),
      window.runtime.EventsOn('transfer:progress', data => {
        const total  = data.total_bytes || 0
        const sent   = data.bytes_sent  || 0
        const pct    = total > 0 ? Math.round((sent / total) * 100) : 0
        const now    = Date.now()
        const elapsed = (now - speedRef.current.time) / 1000
        if (elapsed >= 0.5) {
          const diff  = sent - speedRef.current.bytes
          const speed = elapsed > 0 ? Math.max(0, diff / elapsed) : 0
          speedRef.current = { time: now, bytes: sent, text: `${formatBytes(speed)}/s` }
        }
        setTransfer({
          visible:    true,
          title:      data.direction === 'send' ? `Sending to ${data.peer_addr}` : `Receiving from ${data.peer_addr}`,
          fileName:   data.file_name || '—',
          speed:      speedRef.current.text,
          percent:    pct,
          bytesSent:  formatBytes(sent),
          totalBytes: formatBytes(total),
          direction:  data.direction,
        })
      }),
      window.runtime.EventsOn('transfer:complete', data => {
        setTransfer(t => ({ ...t, percent: 100 }))
        setTimeout(() => setTransfer({ visible: false }), 2000)
      }),
      window.runtime.EventsOn('transfer:error', () => {
        setTimeout(() => setTransfer({ visible: false }), 2000)
      }),
    ]

    return () => offs.forEach(off => typeof off === 'function' && off())
  }, [])

  const handleTabChange = useCallback((tab) => {
    setPrevTab(activeTab)
    setActiveTab(tab)
  }, [activeTab])

  const cancelTransfer = () => {
    window.go?.gui?.App?.CancelTransfer?.()
    setTransfer({ visible: false })
  }

  const acceptConnection = () => {
    if (connRequest.addr) {
      window.go?.gui?.App?.AcceptConnection?.(connRequest.addr)
    }
    setConnRequest({ visible: false, addr: '' })
  }

  const rejectConnection = () => {
    if (connRequest.addr) {
      window.go?.gui?.App?.RejectConnection?.(connRequest.addr)
    }
    setConnRequest({ visible: false, addr: '' })
  }

  const direction = TAB_ORDER.indexOf(activeTab) > TAB_ORDER.indexOf(prevTab) ? 1 : -1

  const tabs = {
    send:     <SendTab
                onSendingStart={() => setIsSending(true)}
                onSendingStop={() => { setIsSending(false); setSenderPort(null) }}
                isSending={isSending}
                senderPort={senderPort}
              />,
    receive:  <ReceiveTab />,
    history:  <HistoryTab />,
    settings: <SettingsTab />,
  }

  return (
    <div className={styles.app}>
      {/* Background mesh orbs */}
      <div className="bg-mesh">
        <div className="bg-orb bg-orb-1" style={{ background: 'radial-gradient(circle, #EED7BA, transparent 70%)' }} />
        <div className="bg-orb bg-orb-2" style={{ background: 'radial-gradient(circle, #D9E0E5, transparent 70%)' }} />
        <div className="bg-orb bg-orb-3" style={{ background: 'radial-gradient(circle, #EADBCC, transparent 70%)' }} />
      </div>

      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} deviceInfo={deviceInfo} />

      <main className={styles.main}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            className={styles.tabWrapper}
            initial={{ opacity: 0, x: direction * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -20 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {tabs[activeTab]}
          </motion.div>
        </AnimatePresence>
      </main>

      <TransferOverlay transfer={transfer} onCancel={cancelTransfer} />

      <AnimatePresence>
        {connRequest.visible && (
          <motion.div
            className={overlayStyles.overlay}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{ zIndex: 9998 }}
          >
            <div className={overlayStyles.header}>
              <div className={overlayStyles.headerLeft}>
                <div className={overlayStyles.dirIcon}>
                  <Monitor size={15} />
                </div>
                <div>
                  <div className={overlayStyles.title}>Incoming Connection</div>
                  <div className={overlayStyles.speed}>{connRequest.addr}</div>
                </div>
              </div>
            </div>
            <div className={overlayStyles.body}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                A device wants to send you files. Accept the transfer?
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={rejectConnection}
                style={{ flex: 1 }}
              >
                <X size={14} /> Reject
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={acceptConnection}
                style={{ flex: 1 }}
              >
                <Check size={14} /> Accept
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
