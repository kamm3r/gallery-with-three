import { useThree } from '@react-three/fiber';
import { Box, Flex } from '@react-three/flex';
import { ReactElement, ReactNode } from 'react';
import { BigPainting } from './BigPainting';
import Texts from './text';

export const TwoColumn = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const { viewport } = useThree();

  return (
    <Box
      dir='column'
      justify='center'
      align='center'
      // position={[-viewport.width / 2, viewport.height / 5, 0]}
      // size={[viewport.width, viewport.height, 0]}
      wrap='wrap'
    >
      <Box grow={1} shrink={1} basis={100} marginLeft={1}>
        {/* <BigPainting /> */}
        {children}
      </Box>
      <Box grow={2} shrink={1} basis={100} marginRight={1}>
        <Box>
          <Texts
            bold
            lineHeight={1.5}
            letterSpacing={-0.05}
            color='black'
            maxWidth={(viewport.width / 4) * 3}
            fontSize={1}
          >
            Nothing Written
          </Texts>
        </Box>
        <Box>
          <Texts
            italic
            lineHeight={1.5}
            letterSpacing={-0.05}
            color='#1f1f1f'
            maxWidth={(viewport.width / 25) * 3}
            fontSize={0.5}
          >
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Ullam
            facilis dignissimos sapiente eveniet! Adipisci voluptates eius quos
            rerum? In, repellat!
          </Texts>
        </Box>
      </Box>
    </Box>
  );
};
