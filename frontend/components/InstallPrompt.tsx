"use client";

import { useEffect, useState } from "react";
import { isIOS, isStandalone } from "@/lib/push";
import { Card } from "./ui";

export function InstallPrompt() {
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIOS());
  }, []);

  if (standalone) return null;

  return (
    <Card className="space-y-2 border-accent/40">
      <h2 className="text-sm font-semibold text-text-primary">📲 홈 화면에 추가하기</h2>
      {ios ? (
        <p className="text-sm text-text-secondary">
          아이폰에서는 홈 화면에 추가해야 알림을 받을 수 있습니다. Safari 하단의 공유 버튼{" "}
          <span aria-hidden>⎋</span> 을 누른 뒤 <b>&quot;홈 화면에 추가&quot;</b> <span aria-hidden>➕</span>
          를 선택하세요.
        </p>
      ) : (
        <p className="text-sm text-text-secondary">
          브라우저 주소창의 설치 아이콘(또는 메뉴 → &quot;앱 설치&quot;)으로 DayFit을 앱처럼 설치할 수 있습니다.
          설치하면 알림을 안정적으로 받을 수 있어요.
        </p>
      )}
    </Card>
  );
}
