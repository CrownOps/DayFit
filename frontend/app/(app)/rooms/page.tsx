"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { meetingRoomsApi } from "@/lib/resources";
import type { MeetingRoom, MeetingRoomReservation } from "@/lib/types";
import { addDays, hhmm, isoDate, koreanDate } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Input, Label, Spinner, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { clsx } from "@/lib/clsx";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  const [date, setDate] = useState(isoDate(new Date()));
  const [reservations, setReservations] = useState<MeetingRoomReservation[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    meetingRoomsApi
      .list()
      .then((data) => {
        setRooms(data);
        if (data.length > 0) setSelectedRoomId((prev) => prev ?? data[0].id);
      })
      .catch((err) => setRoomsError(err instanceof ApiError ? err.message : "회의실 목록을 불러오지 못했습니다"))
      .finally(() => setRoomsLoading(false));
  }, []);

  const loadReservations = useCallback(async () => {
    if (selectedRoomId == null) return;
    setListLoading(true);
    setListError(null);
    try {
      const data = await meetingRoomsApi.reservations(selectedRoomId, date);
      setReservations([...data].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "예약 현황을 불러오지 못했습니다");
    } finally {
      setListLoading(false);
    }
  }, [selectedRoomId, date]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  async function cancelReservation(id: number) {
    if (!confirm("이 예약을 취소할까요?")) return;
    try {
      await meetingRoomsApi.cancel(id);
      await loadReservations();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "취소에 실패했습니다");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">회의실 예약</h1>
        <Button onClick={() => setModalOpen(true)} disabled={selectedRoomId == null}>
          예약하기
        </Button>
      </div>

      {roomsLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : roomsError ? (
        <Card>
          <p className="text-sm text-text-tertiary">
            회의실 목록을 불러올 수 없습니다. <Link href="/settings" className="text-accent underline">설정</Link>
            에서 GCS Pulse API 토큰을 등록했는지 확인하세요.
          </p>
        </Card>
      ) : rooms.length === 0 ? (
        <Card>
          <p className="text-sm text-text-tertiary">등록된 회의실이 없습니다.</p>
        </Card>
      ) : (
        <>
          {/* Room picker */}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={clsx(
                  "shrink-0 w-40 rounded-xl border p-3 text-left transition-colors",
                  room.id === selectedRoomId
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface hover:bg-bg"
                )}
              >
                {room.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={room.image_url}
                    alt={room.name}
                    className="mb-2 h-16 w-full rounded-lg object-cover bg-bg"
                  />
                ) : (
                  <div className="mb-2 h-16 w-full rounded-lg bg-bg" />
                )}
                <div className="truncate text-sm font-semibold text-text-primary">{room.name}</div>
                {room.location && (
                  <div className="truncate text-xs text-text-tertiary">{room.location}</div>
                )}
              </button>
            ))}
          </div>

          {selectedRoom?.description && (
            <p className="text-xs text-text-tertiary">{selectedRoom.description}</p>
          )}

          {/* Date nav */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setDate((d) => isoDate(addDays(new Date(d), -1)))}>
                ‹
              </Button>
              <span className="text-sm font-medium text-text-primary min-w-28 text-center">
                {koreanDate(new Date(date))}
              </span>
              <Button variant="ghost" onClick={() => setDate((d) => isoDate(addDays(new Date(d), 1)))}>
                ›
              </Button>
            </div>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto"
            />
          </div>

          <ErrorAlert>{listError}</ErrorAlert>

          {listLoading ? (
            <div className="grid place-items-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : reservations.length === 0 ? (
            <Card>
              <p className="text-sm text-text-tertiary">이 날짜에 예약이 없습니다.</p>
            </Card>
          ) : (
            <Card className="p-0 divide-y divide-border">
              {reservations.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="font-mono text-text-secondary shrink-0">
                    {hhmm(r.start_at)}–{hhmm(r.end_at)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-text-primary">{r.purpose || "제목 없음"}</div>
                    <div className="truncate text-xs text-text-tertiary">
                      {r.reserved_by_name ?? "알 수 없음"}
                    </div>
                  </div>
                  {r.can_cancel && (
                    <button
                      onClick={() => cancelReservation(r.id)}
                      className="text-text-tertiary hover:text-danger text-xs shrink-0"
                    >
                      취소
                    </button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {selectedRoom && (
        <ReserveModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          room={selectedRoom}
          date={date}
          onReserved={loadReservations}
        />
      )}
    </div>
  );
}

function ReserveModal({
  open,
  onClose,
  room,
  date,
  onReserved,
}: {
  open: boolean;
  onClose: () => void;
  room: MeetingRoom;
  date: string;
  onReserved: () => void;
}) {
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStart("10:00");
    setEnd("11:00");
    setPurpose("");
    setError(null);
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await meetingRoomsApi.reserve(room.id, {
        start_at: new Date(`${date}T${start}:00`).toISOString(),
        end_at: new Date(`${date}T${end}:00`).toISOString(),
        purpose: purpose || null,
      });
      onReserved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "예약에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${room.name} 예약 · ${koreanDate(new Date(date))}`}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rv-start">시작</Label>
            <Input id="rv-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="rv-end">종료</Label>
            <Input id="rv-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label htmlFor="rv-purpose">목적</Label>
          <Textarea
            id="rv-purpose"
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="예: 주간 팀 회고"
          />
        </div>
        <ErrorAlert>{error}</ErrorAlert>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "예약"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
