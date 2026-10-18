'use client';

import type { Snapshot } from '@/lib/south-america/server/wire';
import App from './ui/App';
import { DevProvider } from './devtools/devState';
import { ClockProvider } from './store/clock';
import { DayProvider } from './store/dayStore';
import { SaProvider } from './store/SaProvider';
import { ToastProvider } from './ui/common/Toast';
import './sa.css';

/**
 * 클라이언트 쪽 뿌리. 서버가 준 첫 화면 사본(initial)으로 시작해서, 이후에는 동기화 엔진이 서버와 맞춰요.
 * 이 앱은 전체 화면으로 위에 덮여서, 야옹이월드의 하단 탭 위에 보여요 (🏠 버튼으로 홈에 돌아가요).
 */
export function SouthAmericaApp({ initial }: { initial: Snapshot }) {
  return (
    <div className="sa-root">
      <SaProvider initial={initial}>
        <DevProvider persona={initial.persona}>
          <ClockProvider>
            <DayProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </DayProvider>
          </ClockProvider>
        </DevProvider>
      </SaProvider>
    </div>
  );
}
