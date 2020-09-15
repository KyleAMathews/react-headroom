import React from "react";

export default ({ onPin, onUnpin }) => {
  const [scroll, setScroll] = React.useState(0);

  // Tracking scroll value
  React.useEffect(() => {
    const handleScroll = () => setScroll(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    // Cleanup function
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollRef = React.useRef({ scroll: scroll });

  // Handling onPin and onUnpin callbacks
  React.useEffect(() => {
    if (onPin && scrollRef.current.scroll <= scroll) onPin();
    if (onUnpin && scrollRef.current.scroll > scroll) onUnpin();
  }, [scrollRef.current.scroll <= scroll]);

  // Handling the backward scroll behavior
  React.useEffect(() => {
    scrollRef.current.scroll = scroll;
  }, [scroll]);

  return scrollRef.current.scroll > scroll || scroll === 0;
};
