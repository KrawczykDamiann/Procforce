export const metadata = {
  title: 'Procforce Flash Sale',
  description: 'Real-time ticket booking platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body>
        {children}
      </body>
    </html>
  );
}
