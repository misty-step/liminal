interface MarkProps {
  size: number;
  title?: string;
}

export function Mark({ size, title }: MarkProps) {
  const small = size < 24;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={small ? "0 0 16 16" : "0 0 32 32"}
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={!title}
      aria-label={title || "Liminal mark"}
      style={{ display: "block", flex: "none" }}
    >
      {small ? (
        <path
          d="M 2.4 3.237 A 11.2 11.2 0 0 1 13.6 3.237 A 11.2 11.2 0 0 1 8 12.929 A 11.2 11.2 0 0 1 2.4 3.237 Z"
          fill="#1e2126"
        />
      ) : (
        <>
          <circle cx="11.84" cy="12.456" r="8.32" fill="none" stroke="#2a8fa3" strokeWidth="1.05" />
          <circle cx="20.16" cy="12.456" r="8.32" fill="none" stroke="#d0487f" strokeWidth="1.05" />
          <circle cx="16" cy="19.667" r="8.32" fill="none" stroke="#b98310" strokeWidth="1.05" />
          <path
            d="M 11.84 12.462 A 8.32 8.32 0 0 1 20.16 12.462 A 8.32 8.32 0 0 1 16 19.662 A 8.32 8.32 0 0 1 11.84 12.462 Z"
            fill="#1e2126"
          />
        </>
      )}
    </svg>
  );
}
