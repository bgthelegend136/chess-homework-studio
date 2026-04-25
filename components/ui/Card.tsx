interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`rounded-lg border border-stone-200 bg-white shadow-sm ${padding ? 'p-4' : ''} ${className}`}>
      {children}
    </div>
  );
}
