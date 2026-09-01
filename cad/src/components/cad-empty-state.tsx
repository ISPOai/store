import { Box, TriangleAlert } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function CadEmptyState({
  title,
  description,
  error = false,
  action,
}: {
  title: string;
  description: string;
  error?: boolean;
  action?: React.ReactNode;
}) {
  const Icon = error ? TriangleAlert : Box;
  return (
    <Empty className="h-full min-h-[260px] border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="size-5 opacity-[0.72]" strokeWidth={1.7} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
