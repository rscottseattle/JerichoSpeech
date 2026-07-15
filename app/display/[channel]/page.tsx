import { CaptionDisplay } from "../../components/CaptionDisplay";

export default async function DisplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { channel } = await params;
  const query = await searchParams;
  return <CaptionDisplay channel={channel} preview={query.preview !== undefined} />;
}
