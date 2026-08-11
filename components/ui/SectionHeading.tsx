type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-3xl font-black leading-tight text-white sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-steel sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
