"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { NotificationDoc } from "@/lib/types";
import { Badge, Button, cn } from "./ui";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unreadCount = useQuery(api.notifications.unreadCount, {});
  const notifications = useQuery(api.notifications.list, { unreadOnly });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        title="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-muted transition hover:bg-panel hover:text-ink"
      >
        <Bell className="h-4 w-4" />
        {(unreadCount ?? 0) > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-semibold text-white">
            {Math.min(99, unreadCount ?? 0)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-[min(92vw,28rem)] rounded-lg border border-line bg-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Notifications</p>
              <p className="text-xs text-muted">Job reminders, due dates, balances, and manager alerts</p>
            </div>
            <Button type="button" variant="ghost" onClick={() => void markAllRead({})}>
              <CheckCheck className="h-4 w-4" />
              Mark read
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.currentTarget.checked)}
              />
              Unread only
            </label>
            <Badge tone={(unreadCount ?? 0) > 0 ? "red" : "neutral"}>{unreadCount ?? 0} unread</Badge>
          </div>

          <div className="max-h-[28rem] overflow-auto">
            {notifications === undefined ? (
              <div className="m-4 h-28 animate-pulse rounded-md border border-line bg-panel" />
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">No notifications to show.</div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification._id}
                  notification={notification}
                  onRead={() => void markRead({ notificationId: notification._id })}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationItem({
  notification,
  onRead
}: {
  notification: NotificationDoc;
  onRead: () => void;
}) {
  const content = (
    <div
      className={cn(
        "grid gap-1 border-b border-line px-4 py-3 text-left transition hover:bg-panel",
        !notification.isRead && "bg-blue-50/60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {!notification.isRead ? <Circle className="h-2.5 w-2.5 fill-blue-600 text-blue-600" /> : null}
            <p className="text-sm font-semibold text-ink">{notification.title}</p>
          </div>
          <p className="mt-1 text-sm leading-5 text-muted">{notification.message}</p>
        </div>
        <Badge tone={priorityTone(notification.priority)}>{notification.priority}</Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{dateShort(notification.createdAt)}</p>
        <span className="text-xs font-medium text-blue-600">{typeLabel(notification.type)}</span>
      </div>
    </div>
  );

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={onRead}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className="w-full" onClick={onRead}>
      {content}
    </button>
  );
}

function priorityTone(priority: NotificationDoc["priority"]): "neutral" | "blue" | "green" | "amber" | "red" {
  if (priority === "high") return "red";
  if (priority === "medium") return "amber";
  return "neutral";
}

function typeLabel(type: NotificationDoc["type"]) {
  if (type === "assigned") return "Assigned job";
  if (type === "dueSoon") return "Due soon";
  if (type === "dueToday") return "Due today";
  if (type === "overdue") return "Overdue";
  if (type === "balance") return "Balance due";
  if (type === "managerAlert") return "Manager alert";
  return "Report";
}
