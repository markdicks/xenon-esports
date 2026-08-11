import type { Role } from "@/types";

type RoleCardProps = {
  role: Role;
};

export function RoleCard({ role }: RoleCardProps) {
  return (
    <article className="group rounded-lg border border-white/12 bg-white/[0.045] p-5 transition duration-300 hover:-translate-y-1 hover:border-volt/60 hover:bg-white/[0.075]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ion">
            {role.department}
          </p>
          <h3 className="mt-2 font-display text-xl font-bold text-white">
            {role.title}
          </h3>
        </div>
        <span className="rounded-full border border-volt/40 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-volt">
          {role.status}
        </span>
      </div>
      <p className="mt-4 leading-7 text-steel">{role.description}</p>
    </article>
  );
}
