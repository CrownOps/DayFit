"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { meetingRoomsApi } from "@/lib/resources";
import type { MeetingRoom, MeetingRoomReservation, RecurringReservationRule } from "@/lib/types";
import { addDays, hhmm, isoDate, koreanDate, timeLabel } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Input, Label, Spinner, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { clsx } from "@/lib/clsx";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

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

  const [rules, setRules] = useState<RecurringReservationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      setRules(await meetingRoomsApi.recurring.list());
    } catch (err) {
      setRulesError(err instanceof ApiError ? err.message : "정기예약을 불러오지 못했습니다");
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function cancelRule(id: number) {
    if (!confirm("이 정기예약을 취소할까요? 아직 지나지 않은 예약도 함께 취소됩니다.")) return;
    try {
      await meetingRoomsApi.recurring.remove(id);
      await loadRules();
      await loadReservations();
    } catch (err) {
      setRulesError(err instanceof ApiError ? err.message : "취소에 실패했습니다");
    }
  }

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
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setRecurringModalOpen(true)} disabled={selectedRoomId == null}>
            정기예약 추가
          </Button>
          <Button onClick={() => setModalOpen(true)} disabled={selectedRoomId == null}>
            예약하기
          </Button>
        </div>
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

      {/* Recurring reservations ("정기예약") */}
      {!roomsLoading && rooms.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">정기예약</h2>
          <ErrorAlert>{rulesError}</ErrorAlert>
          {rulesLoading ? (
            <div className="grid place-items-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : rules.length === 0 ? (
            <Card>
              <p className="text-sm text-text-tertiary">등록된 정기예약이 없습니다.</p>
            </Card>
          ) : (
            <Card className="p-0 divide-y divide-border">
              {rules.map((rule) => {
                const room = rooms.find((r) => r.id === rule.meeting_room_id);
                const upcoming = rule.occurrences.filter((o) => o.status === "booked").length;
                const failed = rule.occurrences.filter((o) => o.status === "failed");
                return (
                  <div key={rule.id} className="space-y-1 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-text-primary">
                          {room?.name ?? `회의실 #${rule.meeting_room_id}`} · 매주 {WEEKDAY_LABELS[rule.weekday]}요일{" "}
                          {timeLabel(rule.start_time)}–{timeLabel(rule.end_time)}
                        </div>
                        <div className="truncate text-xs text-text-tertiary">
                          {rule.purpose || "목적 없음"} · {rule.starts_on}부터{rule.ends_on ? ` ${rule.ends_on}까지` : ""}
                        </div>
                      </div>
                      {rule.active && (
                        <button
                          onClick={() => cancelRule(rule.id)}
                          className="shrink-0 text-text-tertiary hover:text-danger text-xs"
                        >
                          취소
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      예정 {upcoming}건
                      {failed.length > 0 && (
                        <span className="text-danger"> · 실패 {failed.length}건 ({failed[0].detail})</span>
                      )}
                      {!rule.active && <span> · 취소됨</span>}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </section>
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

      {selectedRoom && (
        <RecurringReservationModal
          open={recurringModalOpen}
          onClose={() => setRecurringModalOpen(false)}
          room={selectedRoom}
          onCreated={loadRules}
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

function RecurringReservationModal({
  open,
  onClose,
  room,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  room: MeetingRoom;
  onCreated: () => void;
}) {
  const [weekday, setWeekday] = useState(0);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [purpose, setPurpose] = useState("");
  const [startsOn, setStartsOn] = useState(isoDate(new Date()));
  const [endsOn, setEndsOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWeekday(0);
    setStart("10:00");
    setEnd("11:00");
    setPurpose("");
    setStartsOn(isoDate(new Date()));
    setEndsOn("");
    setError(null);
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await meetingRoomsApi.recurring.create({
        meeting_room_id: room.id,
        weekday,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
        purpose: purpose || null,
        starts_on: startsOn,
        ends_on: endsOn || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "정기예약 등록에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${room.name} 정기예약`}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="rr-weekday">요일</Label>
          <select
            id="rr-weekday"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          >
            {WEEKDAY_LABELS.map((label, idx) => (
              <option key={idx} value={idx}>
                매주 {label}요일
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rr-start">시작</Label>
            <Input id="rr-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="rr-end">종료</Label>
            <Input id="rr-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rr-starts">시작일</Label>
            <Input id="rr-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="rr-ends">종료일 (선택)</Label>
            <Input id="rr-ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="rr-purpose">목적</Label>
          <Textarea
            id="rr-purpose"
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="예: 주간 팀 회고"
          />
        </div>
        <p className="text-xs text-text-tertiary">
          등록하면 향후 4주치 예약이 즉시 생성됩니다. 이후에도 매일 자동으로 다음 4주치가 유지됩니다.
        </p>
        <ErrorAlert>{error}</ErrorAlert>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "등록"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
