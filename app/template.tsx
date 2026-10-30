export default function RouteTemplate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="route-progress" aria-hidden="true" />
      <div className="route-transition">{children}</div>
    </>
  );
}
