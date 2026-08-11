import type { Role } from "@/types";
import clsx from "clsx";

type RoleCardProps = {
  role: Role;
};

export function RoleCard({ role }: RoleCardProps) {
  const isClosed = role.status === "closed";

  return (
    <article
      className={clsx(
        "group rounded-lg border bg-white/[0.045] p-5 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.075]",
        isClosed
          ? "border-white/10 opacity-75 hover:border-white/20"
          : "border-white/12 hover:border-volt/60",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ion">
            {role.department}
          </p>
          <h3 className="mt-2 font-display text-xl font-bold text-white">
            {role.title}
          </h3>
        </div>
        <span
          className={clsx(
            "rounded-full border px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em]",
            isClosed
              ? "border-white/20 text-steel"
              : "border-volt/40 text-volt",
          )}
        >
          {role.status}
        </span>
      </div>
      <p className="mt-4 leading-7 text-steel">{role.description}</p>
    </article>
  );
}
