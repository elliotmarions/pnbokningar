// Instant branded loading screen shown during server rendering / route
// transitions — replaces the blank white wait on PWA cold launch.
export default function Loading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        background: '#0D1117',
      }}
    >
      <img
        src="/pn-logo.png"
        alt="PostNord"
        width={56}
        height={56}
        style={{ borderRadius: 12, opacity: 0.95 }}
      />
      <div className="app-boot-spinner" />
      <style>{`
        .app-boot-spinner {
          width: 26px; height: 26px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.15);
          border-top-color: #009FE3;
          animation: app-boot-spin 0.7s linear infinite;
        }
        @keyframes app-boot-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
