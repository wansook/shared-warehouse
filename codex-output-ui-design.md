# Tailwind CSS + Shadcn/ui UI 디자인 업그레이드 결과

## 작업 요약

- `frontend`에 Tailwind CSS 3.x, PostCSS, Autoprefixer를 설치하고 CRA 빌드와 호환되도록 설정했습니다.
- `npx shadcn@latest init -d`는 CRA 프로젝트 자동 감지를 지원하지 않아 실패했습니다. 대신 shadcn/ui 수동 설치 방식으로 `components.json`, CSS 변수, UI 컴포넌트를 직접 구성했습니다.
- shadcn 스타일의 `button`, `card`, `input`, `dialog`, `dropdown-menu` 컴포넌트를 `src/components/ui`에 추가했습니다.
- `Dashboard.js`, `Login.js`, `Register.js`, `Profile.js`, `LayoutEditor.js`를 Tailwind 기반 반응형 UI로 재작성했습니다.
- 기존 깨진 한글 문자열과 일부 손상된 JSX를 정상 한국어 문구와 빌드 가능한 JSX로 정리했습니다.
- `npm run build` 통과를 확인했습니다.

## 설치한 패키지

개발 의존성:

```text
tailwindcss@3.4.19
postcss@8.5.15
autoprefixer@10.5.0
```

런타임 의존성:

```text
@radix-ui/react-dialog@1.1.15
@radix-ui/react-dropdown-menu@2.1.16
@radix-ui/react-slot@1.2.4
class-variance-authority@0.7.1
clsx@2.1.1
tailwind-merge@3.6.0
lucide-react@1.16.0
```

## 설정 파일

### frontend/tailwind.config.js

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
```

### frontend/postcss.config.js

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### frontend/src/index.css 핵심

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 210 40% 98%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --primary: 201 96% 32%;
    --secondary: 170 47% 42%;
    --accent: 36 92% 55%;
    --border: 214 32% 88%;
    --ring: 201 96% 32%;
    --radius: 0.5rem;
  }

  body {
    @apply bg-background text-foreground antialiased;
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
}
```

## Shadcn/ui 구성

추가 파일:

```text
frontend/components.json
frontend/src/lib/utils.js
frontend/src/components/ui/button.js
frontend/src/components/ui/card.js
frontend/src/components/ui/input.js
frontend/src/components/ui/dialog.js
frontend/src/components/ui/dropdown-menu.js
```

대표 컴포넌트 코드:

```js
// src/components/ui/button.js
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90',
        ghost: 'hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

## 수정된 주요 파일 핵심 내용

### Dashboard.js

- 상단 고정 헤더, 검색 입력, 계정 드롭다운 적용
- 왼쪽 창고 선택 패널과 오른쪽 탭형 작업 영역 분리
- 카드 기반 창고/캐비넷/계약/하드웨어/네이버 예약 UI 적용
- Radix Dialog 기반 창고/캐비넷/계약 생성 모달 적용
- 반응형 그리드와 상태별 배지 적용

핵심 구조:

```jsx
<main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
  <aside className="space-y-6">
    <Card>
      <CardHeader>
        <SectionTitle icon={Building2} title="창고" />
      </CardHeader>
      <CardContent className="space-y-3">
        {warehouses.map((warehouse) => (
          <button className="w-full rounded-lg border bg-card p-4 text-left transition hover:border-primary">
            ...
          </button>
        ))}
      </CardContent>
    </Card>
  </aside>
  <section className="space-y-6">
    <div className="grid gap-3 rounded-lg border bg-card p-2 sm:grid-cols-2 lg:grid-cols-4">
      ...
    </div>
  </section>
</main>
```

### Login.js / Register.js

- 동일한 인증 카드 레이아웃 적용
- `Input`, `Button`, `Card` 컴포넌트 적용
- 모바일에서도 중앙 정렬되는 단일 컬럼 폼 구성

핵심 구조:

```jsx
<main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
  <Card>
    <CardHeader>
      <CardTitle>로그인</CardTitle>
      <CardDescription>계정으로 접속해 창고 현황을 확인하세요.</CardDescription>
    </CardHeader>
    <CardContent>
      <form className="space-y-4">...</form>
    </CardContent>
  </Card>
</main>
```

### Profile.js

- 프로필 카드, 아바타, 정보 그리드, 편집 모드 폼 적용
- `Button`, `Input`, `Card` 컴포넌트 적용
- 대시보드 이동과 로그아웃 액션을 상단에 배치

### LayoutEditor.js

- 레이아웃 편집 헤더, 속성 패널, 배치 그리드를 카드 기반으로 개선
- 드래그 중인 캐비넷 정보 표시
- 상태별 색상 토큰과 범례 적용
- 좁은 화면에서는 속성 패널과 그리드가 세로로 쌓이도록 반응형 구성

핵심 구조:

```jsx
<div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
  <Card>
    <CardHeader>
      <CardTitle>캐비넷 속성</CardTitle>
    </CardHeader>
  </Card>
  <Card>
    <CardHeader>
      <CardTitle>배치 그리드</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="overflow-auto rounded-lg border bg-muted/20 p-4">...</div>
    </CardContent>
  </Card>
</div>
```

## 빌드 결과

명령:

```bash
npm run build
```

결과:

```text
Creating an optimized production build...
Compiled successfully.

File sizes after gzip:
  146.71 kB  build\static\js\main.73c4ca76.js
  5.05 kB    build\static\css\main.bf645bc4.css
  1.76 kB    build\static\js\453.20359781.chunk.js
```

참고:

```text
(node:15996) [DEP0176] DeprecationWarning: fs.F_OK is deprecated
```

이 경고는 `react-scripts` 빌드 도구 체인에서 나온 Node deprecation warning이며 빌드는 성공했습니다.

## 사용량 및 변경 범위 확인

- 추가/변경된 프론트엔드 패키지: 10개 직접 의존성 또는 개발 의존성
- 추가된 shadcn 스타일 UI 파일: 7개
- 재디자인된 화면 파일: 5개
- 전역 설정/스타일 파일 변경: `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `src/App.css`
- 빌드 산출물 gzip 기준:
  - JS 메인 번들: `146.71 kB`
  - CSS 메인 번들: `5.05 kB`

## 주의 사항

- 작업 전부터 백엔드 파일과 일부 프론트엔드 화면 파일은 이미 수정된 상태였습니다. 이번 작업은 요청 범위인 프론트엔드 UI/Tailwind/Shadcn 설정만 변경했습니다.
- CRA는 최신 `shadcn` CLI 자동 초기화 대상 프레임워크가 아니어서 CLI 초기화 대신 수동 구성을 적용했습니다.
