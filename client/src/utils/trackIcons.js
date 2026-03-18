import solutionsIcon from '../assests/solutions.png';
import deliveryIcon from '../assests/delivery.png';
import learningIcon from '../assests/learning.png';
import gtmSalesIcon from '../assests/increase.png';
import leadershipIcon from '../assests/leadership.png';

export const TRACK_ICON_MAP = {
    Solutions: solutionsIcon,
    Delivery: deliveryIcon,
    Learning: learningIcon,
    'GTM/Sales': gtmSalesIcon,
    'Organizational Building & Thought Leadership': leadershipIcon,
};

export const getTrackIconSrc = (track) => TRACK_ICON_MAP[track] || '';
