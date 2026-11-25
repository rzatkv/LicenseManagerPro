<?php
/**
 * License Manager Pro — administrator licenses view (searchable list).
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\View\Licenses;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\MVC\View\HtmlView as BaseHtmlView;
use Joomla\CMS\Toolbar\ToolbarHelper;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model\LicenseModel;
use Throwable;

class HtmlView extends BaseHtmlView
{
    /** @var array<int, array> */
    public array $licenses = [];
    public ?string $licenseError = null;
    public string $search = '';
    public string $status = '';

    public function display($tpl = null): void
    {
        ToolbarHelper::title(Text::_('COM_LICENSMANAGERPRO_LICENSES'), 'key');
        ToolbarHelper::preferences('com_licensemanagerpro');

        $input = Factory::getApplication()->getInput();
        $this->search = trim((string) $input->getString('search', ''));
        $this->status = trim((string) $input->getString('status', ''));

        /** @var LicenseModel $model */
        $model = $this->getModel();
        try {
            $this->licenses = $model->getLicenses(
                $this->search === '' ? null : $this->search,
                $this->status === '' ? null : $this->status,
                100
            );
        } catch (Throwable $e) {
            $this->licenseError = $e->getMessage();
        }

        parent::display($tpl);
    }
}
