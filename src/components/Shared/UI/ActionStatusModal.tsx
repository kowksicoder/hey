import { CheckCircleIcon } from "@heroicons/react/24/solid";
import type { CSSProperties } from "react";
import { memo } from "react";
import cn from "@/helpers/cn";
import Button from "./Button";
import Modal from "./Modal";
import Spinner from "./Spinner";

type ActionStatusTone = "pending" | "success";

interface ActionStatusModalProps {
  actionLabel?: string;
  description?: string;
  label?: string;
  onAction?: () => void;
  onClose?: () => void;
  show: boolean;
  tone: ActionStatusTone;
  title: string;
}

const CONFETTI_PIECES = [
  ["10%", "#22c55e", "0.02s", "1.25s", "165deg", "-18px"],
  ["18%", "#f59e0b", "0.1s", "1.05s", "-155deg", "20px"],
  ["29%", "#38bdf8", "0s", "1.35s", "190deg", "-10px"],
  ["42%", "#fb7185", "0.08s", "1.15s", "-185deg", "14px"],
  ["50%", "#a78bfa", "0.04s", "1.32s", "220deg", "-6px"],
  ["58%", "#f97316", "0.16s", "1.18s", "-200deg", "18px"],
  ["68%", "#10b981", "0.06s", "1.24s", "175deg", "-16px"],
  ["78%", "#eab308", "0.13s", "1.08s", "-170deg", "12px"],
  ["86%", "#60a5fa", "0.02s", "1.28s", "205deg", "-12px"]
] as const;

const ActionStatusModal = ({
  actionLabel,
  description,
  label,
  onAction,
  onClose,
  show,
  tone,
  title
}: ActionStatusModalProps) => (
  <Modal onClose={onClose} show={show} size="xs">
    <div className="relative overflow-hidden px-4 py-4 text-center md:px-5 md:py-5">
      {tone === "success" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
        >
          {CONFETTI_PIECES.map(
            ([left, color, delay, duration, rotate, xEnd], index) => (
              <span
                className="every1-confetti-piece"
                key={`${left}-${index}`}
                style={
                  {
                    "--every1-confetti-rotate": rotate,
                    "--every1-confetti-x-end": xEnd,
                    animationDelay: delay,
                    animationDuration: duration,
                    backgroundColor: color,
                    left
                  } as CSSProperties
                }
              />
            )
          )}
        </div>
      ) : null}

      <div className="relative">
        <div
          className={cn(
            "mx-auto flex size-12 items-center justify-center rounded-full ring-1 ring-inset md:size-14",
            tone === "success"
              ? "bg-emerald-500/12 text-emerald-600 ring-emerald-500/18 dark:bg-emerald-500/14 dark:text-emerald-300 dark:ring-emerald-500/22"
              : "bg-sky-500/10 text-sky-600 ring-sky-500/16 dark:bg-sky-500/14 dark:text-sky-300 dark:ring-sky-500/20"
          )}
        >
          {tone === "success" ? (
            <CheckCircleIcon className="size-7 md:size-8" />
          ) : (
            <Spinner className="text-current" size="sm" />
          )}
        </div>

        {label ? (
          <p className="mt-3 font-semibold text-[10px] text-gray-500 uppercase tracking-[0.18em] dark:text-gray-400">
            {label}
          </p>
        ) : null}

        <p className="mt-2 text-balance font-semibold text-[15px] text-gray-950 leading-5 md:text-base dark:text-gray-50">
          {title}
        </p>

        {description ? (
          <p className="mx-auto mt-1.5 max-w-[16rem] text-balance text-[12px] text-gray-500 leading-5 md:max-w-[17rem] dark:text-gray-400">
            {description}
          </p>
        ) : null}

        {actionLabel ? (
          <div className="mt-4">
            <Button className="w-full justify-center" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  </Modal>
);

export default memo(ActionStatusModal);
