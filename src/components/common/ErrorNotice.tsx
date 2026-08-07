interface Props {
  message: string
  onRetry?: () => void
}

export function ErrorNotice({ message, onRetry }: Props) {
  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center p-4">
      <div className="panel border-mauve-600 p-6 max-w-md w-full text-center">
        <p className="text-mauve-200 font-medium mb-4">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn btn-mauve">
            다시 시도
          </button>
        )}
      </div>
    </div>
  )
}
