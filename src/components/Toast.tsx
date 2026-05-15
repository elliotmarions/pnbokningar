'use client'
import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onDismiss?: () => void
}

export function Toast({ message, type = 'success', onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) { setVisible(false); return }
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 2400)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  return (
    <div className={`toast ${visible ? 'show' : ''} ${type === 'error' ? 'error' : ''}`}>
      <span className="ind" />
      {message}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' }>({ msg: '', type: 'success' })
  const show = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type })
  const clear = () => setToast({ msg: '', type: 'success' })
  return { toast, show, clear }
}
