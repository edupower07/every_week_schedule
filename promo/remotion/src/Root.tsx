import { Composition } from 'remotion';
import { Reel, FPS, W, H, DURATION_SEC } from './Reel';
import { Cover } from './Cover';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="reel" component={Reel} durationInFrames={Math.round(DURATION_SEC * FPS)} fps={FPS} width={W} height={H} />
    <Composition id="cover" component={Cover} durationInFrames={1} fps={FPS} width={W} height={H} />
  </>
);
