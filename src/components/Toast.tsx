'use client'
import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'warn'

interface ToastProps {
  message: string
  type?: ToastType
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
    <div className={`toast ${visible ? 'show' : ''} ${type !== 'success' ? type : ''}`}>
      <span className="ind" />
      {message}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: ToastType }>({ msg: '', type: 'success' })
  const show = (msg: string, type: ToastType = 'success') => setToast({ msg, type })
  const clear = () => setToast({ msg: '', type: 'success' })
  return { toast, show, clear }
}
