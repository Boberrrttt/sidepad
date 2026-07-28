type GithubCardMetaProps = {
  state?: 'OPEN' | 'CLOSED';
  labels?: string[];
  assignees?: string[];
  dense?: boolean;
};

export function GithubCardMeta({
  state,
  labels,
  assignees,
  dense,
}: GithubCardMetaProps) {
  if (!state && !labels?.length && !assignees?.length) return null;

  const chip = dense
    ? 'rounded-md px-1.5 py-0.5 text-[10px] font-medium'
    : 'rounded-md px-1.5 py-0.5 text-[11px] font-medium';

  return (
    <div className={`flex flex-wrap gap-1 ${dense ? 'mt-1.5' : 'mt-2'}`}>
      {state ? (
        <span
          className={`${chip} ${
            state === 'OPEN'
              ? 'bg-[var(--accent-soft)] text-[var(--ok)]'
              : 'bg-[var(--line-soft)] text-[var(--ink-soft)]'
          }`}
        >
          {state === 'OPEN' ? 'Open' : 'Closed'}
        </span>
      ) : null}
      {labels?.map((labelName) => (
        <span
          key={labelName}
          className={`${chip} bg-[var(--line-soft)] text-[var(--ink)]`}
        >
          {labelName}
        </span>
      ))}
      {assignees?.map((login) => (
        <span
          key={login}
          className={`${chip} bg-[var(--line-soft)] text-[var(--ink-soft)]`}
        >
          @{login}
        </span>
      ))}
    </div>
  );
}
