import { notFound } from 'next/navigation';
import { videos } from '@/lib/service';
import { Header } from '@/components/header';
import { VideoPlayer } from '@/components/video-player';
export const dynamic = 'force-dynamic';
export default async function Education({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = videos().find((v) => v.id === id);
  if (!video) notFound();
  return (
    <>
      <Header />
      <VideoPlayer id={video.id} youtubeId={video.youtubeId} title={video.title} />
    </>
  );
}
