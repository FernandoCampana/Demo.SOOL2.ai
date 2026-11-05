export function BarraProgresso({ percentual, etapa }: { percentual: number; etapa?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percentual)))
  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-divisor"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p}
        aria-label="Progresso do carregamento"
      >
        <div className="h-full rounded-full bg-primaria transition-[width] duration-300" style={{ width: `${p}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-texto-secundario">
        <span>{etapa}</span>
        <span className="tabular-nums">{p}%</span>
      </div>
    </div>
  )
}
