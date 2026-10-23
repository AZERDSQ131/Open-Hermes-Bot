import { useId } from 'react';
import { createStyles } from '../theme';
import { Text, View } from 'react-native';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';
import {
  BLOUB_FRAMES,
  BLOUB_SHAPES,
  type BloubShape,
  type BloubVariant,
} from '../bloubFrames';
import { box } from '../theme';

/**
 * The face a bot wears. The geometry is the app's own, vendored from
 * jeremy-prt/bloub (MIT) and shared with the desktop window and the mockup:
 * nothing here redraws a Bloub by hand.
 */
export const EYE_PAPER = '#f6f3e9';

export function botShape(shape?: string): BloubShape {
  const wanted = String(shape ?? '').trim() as BloubShape;
  return BLOUB_SHAPES.includes(wanted) ? wanted : 'cercle';
}

type BloubProps = {
  shape?: BloubShape;
  color: string;
  variant?: BloubVariant;
  size?: number;
};

export function Bloub({ shape = 'cercle', color, variant = 'neutral', size = 40 }: BloubProps) {
  const raw = useId();
  const maskId = `bloub-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const data = BLOUB_FRAMES[shape] ?? BLOUB_FRAMES.cercle;
  const frame = data.variants[variant] ?? data.variants.neutral;
  const view = data.viewBox;
  const px = box(size);

  return (
    <Svg
      width={px}
      height={px}
      viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <Mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-view}
          y={-view}
          width={view * 2}
          height={view * 2}
        >
          <Path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, index) => (
            <Path
              key={index}
              d={eye.d}
              transform={eye.matrix}
              opacity={eye.alpha}
              fill="#000"
            />
          ))}
        </Mask>
      </Defs>
      <Path d={frame.bodyPath} fill={EYE_PAPER} />
      <G mask={`url(#${maskId})`}>
        <Rect x={-view} y={-view} width={view * 2} height={view * 2} fill={color} />
      </G>
    </Svg>
  );
}

/** The three faces of a group, laid over one another as the app does it. */
const GROUP_LAYOUT = [
  { top: 0, left: 9, scale: 0.64 },
  { bottom: 0, left: 0, scale: 0.57 },
  { bottom: 2, right: 0, scale: 0.53 },
] as const;

type GroupProps = {
  members: { shape: BloubShape; color: string }[];
  size?: number;
};

export function BloubGroup({ members, size = 40 }: GroupProps) {
  const visible = members.slice(0, 3);
  const extra = members.length - visible.length;
  const px = box(size);

  return (
    <View style={{ width: px, height: px }}>
      {visible.map((member, index) => {
        const place = GROUP_LAYOUT[index];
        const shade = place.scale * 100;
        return (
          <View
            key={index}
            style={[
              styles.groupItem,
              {
                width: `${shade}%`,
                height: `${shade}%`,
                top: 'top' in place ? `${place.top}%` : undefined,
                bottom: 'bottom' in place ? `${place.bottom}%` : undefined,
                left: 'left' in place ? `${place.left}%` : undefined,
                right: 'right' in place ? `${place.right}%` : undefined,
              },
            ]}
          >
            <Bloub shape={member.shape} color={member.color} size={Math.round(size * place.scale)} />
          </View>
        );
      })}
      {extra > 0 && size >= 32 ? (
        <View
          style={[
            styles.more,
            {
              minWidth: px * 0.3,
              height: px * 0.3,
              borderRadius: px,
            },
          ]}
        >
          <Text style={{ fontSize: Math.max(10, Math.round(px * 0.3 * 0.62)), color: '#1b1b19' }}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = createStyles({
  groupItem: { position: 'absolute' },
  more: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#19191b',
    backgroundColor: '#f2efe5',
  },
});
