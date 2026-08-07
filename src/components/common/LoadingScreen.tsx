export function LoadingScreen({ message = '불러오는 중...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-9 h-9 border-[3px] border-sand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-ink-400 text-sm">{message}</p>
      </div>
    </div>
  )
}
