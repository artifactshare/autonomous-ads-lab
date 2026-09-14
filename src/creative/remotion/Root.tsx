import { Composition } from 'remotion'
import { LoopAd, defaultAdProps, adDuration, FPS } from './LoopAd.tsx'

export const Root = () => (
  <Composition id="LoopAd" component={LoopAd} width={1920} height={1080} fps={FPS} durationInFrames={adDuration(defaultAdProps)} defaultProps={defaultAdProps} />
)
