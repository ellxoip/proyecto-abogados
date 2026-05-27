import Image from "next/image";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
};

export function BrandMark({ className, size = "md" }: BrandMarkProps) {
  const sizeStyles = {
    sm: "w-[118px]",
    md: "w-[156px]",
    lg: "w-[210px]",
    xl: "w-[260px]",
  }[size];

  return (
    <div className={["inline-flex shrink-0 items-center justify-center", sizeStyles, className].filter(Boolean).join(" ")}>
      <Image
        src="/brand/hive-control-logo.svg"
        alt="Hive Service Control"
        width={320}
        height={220}
        unoptimized
        className="block h-auto w-full object-contain"
      />
    </div>
  );
}
