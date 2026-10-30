import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/side-images/upload')({staticData:{sitemap:false},server:{handlers:{POST:async({request})=>{const {uploadSideImage}=await import('@/lib/side-images.server');return uploadSideImage(request);}}}});
