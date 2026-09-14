import { Composition } from 'remotion'
import { LoopAd, defaultAdProps, adDuration, FPS } from './LoopAd.tsx'
import { LoopAdV2, defaultAdV2Props, adV2Duration, W as W2, H as H2 } from './LoopAdV2.tsx'

export const Root = () => (
  <>
  <Composition id="LoopAdV2" component={LoopAdV2} width={W2} height={H2} fps={FPS} durationInFrames={adV2Duration(defaultAdV2Props)} defaultProps={defaultAdV2Props} />
  <Composition id="LoopAd" component={LoopAd} width={1920} height={1080} fps={FPS} durationInFrames={adDuration(defaultAdProps)} defaultProps={defaultAdProps} />
  </>
)
